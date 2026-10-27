// The model providers in order, behind one ModelProvider. The first provider whose breaker is
// closed answers; a failure moves the call to the next, or, with one provider configured, retries
// it once (the SDKs never retry, so this is the only retry). At most two attempts, and none that
// could end after CALL_TIMEOUT_MS. A decline (null) is final, because a refusal is an answer and
// is never routed to another vendor. A provider that fails three times in a row is skipped for a
// minute (one warning); one configuration failure (a retired model, a bad key) skips it for 15
// minutes (one error). When every breaker is open the primary is tried anyway. State is per
// process, as the rate limiter's is.
import type { Logger } from 'pino';

import { MODEL } from '../constants/model.js';

import { ModelProviderError } from './ModelProviderError.js';
import type { ModelFailureKind, ProviderId } from './ModelProviderError.js';
import type { ModelPrompt, ModelProvider } from './modelProvider.js';

const { ATTEMPT_TIMEOUT_MS, CALL_TIMEOUT_MS, MAX_ATTEMPTS } = MODEL;
const { CONFIG_COOLDOWN_MS, FAILURES_TO_OPEN, TRANSIENT_COOLDOWN_MS } = MODEL.BREAKER;

interface BreakerState {
  failures: number;
  openUntil: number;
}

interface FailoverDeps {
  logger: Logger;
  now?: () => number;
  providers: ModelProvider[];
}

function toFailure(provider: ModelProvider, error: unknown): ModelProviderError {
  return error instanceof ModelProviderError
    ? error
    : new ModelProviderError(provider.id, provider.model, null, 'transient');
}

function createFailoverModelProvider({ logger, now = Date.now, providers }: FailoverDeps): ModelProvider {
  const [primary] = providers;
  if (primary === undefined) throw new Error('createFailoverModelProvider needs at least one provider');
  const breakers = new Map<ProviderId, BreakerState>(providers.map(({ id }) => [id, { failures: 0, openUntil: 0 }]));

  function isOpen(id: ProviderId): boolean {
    return (breakers.get(id)?.openUntil ?? 0) > now();
  }

  function openBreaker(state: BreakerState, kind: ModelFailureKind): void {
    state.openUntil = now() + (kind === 'config' ? CONFIG_COOLDOWN_MS : TRANSIENT_COOLDOWN_MS);
    state.failures = 0;
  }

  function recordFailure(failure: ModelProviderError): void {
    const state = breakers.get(failure.provider);
    if (state === undefined) return;
    const { model, provider, status } = failure;
    if (failure.kind === 'config') {
      const wasOpen = isOpen(provider);
      openBreaker(state, 'config');
      if (!wasOpen)
        logger.error({ model, provider, status }, 'model configuration failure; provider skipped for 15 minutes');
      return;
    }
    state.failures += 1;
    if (state.failures >= FAILURES_TO_OPEN) {
      openBreaker(state, 'transient');
      logger.warn(
        { cooldownMs: TRANSIENT_COOLDOWN_MS, model, provider },
        'model provider skipped after repeated failures',
      );
    }
  }

  function recordSuccess(id: ProviderId): void {
    const state = breakers.get(id);
    if (state !== undefined) Object.assign(state, { failures: 0, openUntil: 0 });
  }

  // With one provider configured the wrapper is its retry; otherwise the next provider is.
  function plan(): ModelProvider[] {
    if (providers.length === 1) return [primary, primary];
    const ready = providers.filter(({ id }) => !isOpen(id));
    return ready.length > 0 ? ready : [primary];
  }

  async function answer(prompt: ModelPrompt): Promise<string | null> {
    const callStarted = now();
    let lastFailure: ModelProviderError | undefined;
    for (const [index, candidate] of plan().slice(0, MAX_ATTEMPTS).entries()) {
      if (index > 0 && now() + ATTEMPT_TIMEOUT_MS > callStarted + CALL_TIMEOUT_MS) break;
      if (lastFailure?.kind === 'config' && lastFailure.provider === candidate.id) break;
      const started = now();
      const base = { isFailover: candidate.id !== primary.id, model: candidate.model, provider: candidate.id };
      try {
        const result = await candidate.answer(prompt);
        recordSuccess(candidate.id);
        logger.info(
          { ...base, latencyMs: now() - started, outcome: result === null ? 'declined' : 'answered' },
          'model call',
        );
        return result;
      } catch (error) {
        lastFailure = toFailure(candidate, error);
        recordFailure(lastFailure);
        logger.info({ ...base, latencyMs: now() - started, outcome: lastFailure.kind }, 'model call');
      }
    }
    throw lastFailure;
  }

  return { answer, id: primary.id, model: primary.model };
}

export { createFailoverModelProvider };
