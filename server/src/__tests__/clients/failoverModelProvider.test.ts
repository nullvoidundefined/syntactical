// server/src/__tests__/clients/failoverModelProvider.test.ts
// The failover in front of the model providers: the primary answers when it can; a failure moves the
// call to the next provider, or retries the only one once; a decline is final, including an OpenAI
// 400 that flags the prompt; a failing provider is skipped for a cooldown and the opening is logged;
// a configuration failure (a retired model, a bad key) opens a long cooldown and logs an error; the
// whole call is bounded at twice the attempt timeout. The log never carries the prompt or the answer.
import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { createFailoverModelProvider } from '../../clients/failoverModelProvider.js';
import { classifyModelFailure, ModelProviderError } from '../../clients/ModelProviderError.js';
import type { ProviderId } from '../../clients/ModelProviderError.js';
import type { ModelProvider } from '../../clients/modelProvider.js';
import { createOpenAIModelProvider } from '../../clients/openAIModelProvider.js';
import type { ResponsesClient } from '../../clients/openAIModelProvider.js';
import { MODEL } from '../../constants/model.js';

import { createRecordingLogger } from '../support/recordingLogger.js';

const PROMPT = { system: 'You are the tutor.', user: '<learner_message>"secret question"</learner_message>' };

type Outcome = string | null | 'transient' | 'config' | 'bad-request';

interface FakeClock {
  advance(ms: number): void;
  now(): number;
}

function fakeClock(): FakeClock {
  let value = 0;
  return {
    advance: (ms) => {
      value += ms;
    },
    now: () => value,
  };
}

// A provider that plays its outcomes in order and repeats the last; each call moves the clock by
// latencyMs, standing in for the time the request took.
function provider(
  id: ProviderId,
  outcomes: Outcome[],
  timing: { clock?: FakeClock; latencyMs?: number } = {},
): ModelProvider & { calls: number } {
  const queue = [...outcomes];
  const model = `${id}-model`;
  const fake = {
    calls: 0,
    id,
    model,
    answer: vi.fn(() => {
      fake.calls += 1;
      timing.clock?.advance(timing.latencyMs ?? 0);
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next === 'transient') return Promise.reject(new ModelProviderError(id, model, 503, 'transient'));
      if (next === 'config') return Promise.reject(new ModelProviderError(id, model, 404, 'config'));
      if (next === 'bad-request') {
        const kind = classifyModelFailure(400, null);
        if (kind === 'decline') throw new Error('a 400 without a policy code must not be a decline');
        return Promise.reject(new ModelProviderError(id, model, 400, kind));
      }
      return Promise.resolve(next ?? null);
    }),
  };
  return fake;
}

function levels(entries: Array<Record<string, unknown>>, level: string) {
  return entries.filter((entry) => entry.level === level);
}

describe('createFailoverModelProvider', () => {
  it('answers from the primary and never calls the secondary', async () => {
    const primary = provider('anthropic', ['From Claude.']);
    const secondary = provider('openai', ['From OpenAI.']);
    const { logger } = createRecordingLogger();

    await expect(createFailoverModelProvider({ logger, providers: [primary, secondary] }).answer(PROMPT)).resolves.toBe(
      'From Claude.',
    );
    expect(secondary.calls).toBe(0);
  });

  it('answers from the secondary when the primary fails, without retrying the primary', async () => {
    const primary = provider('anthropic', ['transient']);
    const secondary = provider('openai', ['From OpenAI.']);
    const { logger } = createRecordingLogger();

    await expect(createFailoverModelProvider({ logger, providers: [primary, secondary] }).answer(PROMPT)).resolves.toBe(
      'From OpenAI.',
    );
    expect(primary.calls).toBe(1);
  });

  it('treats a decline as final and never sends it to the secondary', async () => {
    const primary = provider('anthropic', [null]);
    const secondary = provider('openai', ['From OpenAI.']);
    const { logger } = createRecordingLogger();

    await expect(
      createFailoverModelProvider({ logger, providers: [primary, secondary] }).answer(PROMPT),
    ).resolves.toBeNull();
    expect(secondary.calls).toBe(0);
  });

  it('resolves null for an OpenAI 400 invalid_prompt, never calls the secondary, and opens no breaker', async () => {
    const error = OpenAI.APIError.generate(
      400,
      { error: { code: 'invalid_prompt', message: 'x' } },
      'x',
      new Headers(),
    );
    const create = vi.fn().mockRejectedValue(error);
    const primary = createOpenAIModelProvider({
      apiKey: 'unused',
      model: 'small-model',
      responses: { create } as unknown as ResponsesClient,
    });
    const secondary = provider('anthropic', ['From Claude.']);
    const { entries, logger } = createRecordingLogger();
    const failover = createFailoverModelProvider({ logger, providers: [primary, secondary] });

    await expect(failover.answer(PROMPT)).resolves.toBeNull();
    expect(secondary.calls).toBe(0);
    expect(entries.find((entry) => entry.msg === 'model call')).toMatchObject({ outcome: 'declined' });

    await failover.answer(PROMPT);
    expect(create).toHaveBeenCalledTimes(2);
    expect(levels(entries, 'error')).toHaveLength(0);
    expect(levels(entries, 'warn')).toHaveLength(0);
  });

  it('fails one 400 of another kind over for that request but does not open the config breaker', async () => {
    const primary = provider('anthropic', ['bad-request', 'From Claude.']);
    const secondary = provider('openai', ['From OpenAI.']);
    const { entries, logger } = createRecordingLogger();
    const failover = createFailoverModelProvider({ logger, providers: [primary, secondary] });

    await expect(failover.answer(PROMPT)).resolves.toBe('From OpenAI.');
    await expect(failover.answer(PROMPT)).resolves.toBe('From Claude.');
    expect(primary.calls).toBe(2);
    expect(levels(entries, 'error')).toHaveLength(0);
  });

  it('rejects with the last failure when every provider fails', async () => {
    const { logger } = createRecordingLogger();
    const failover = createFailoverModelProvider({
      logger,
      providers: [provider('anthropic', ['transient']), provider('openai', ['transient'])],
    });

    await expect(failover.answer(PROMPT)).rejects.toMatchObject({ provider: 'openai' });
  });

  it('retries the only provider once after a transient failure', async () => {
    const only = provider('anthropic', ['transient', 'Second try.']);
    const { entries, logger } = createRecordingLogger();

    await expect(createFailoverModelProvider({ logger, providers: [only] }).answer(PROMPT)).resolves.toBe(
      'Second try.',
    );
    expect(only.calls).toBe(2);
    expect(entries.filter((entry) => entry.msg === 'model call').map((entry) => entry.isFailover)).toEqual([
      false,
      false,
    ]);
  });

  it('never makes a third attempt, and never retries a config failure', async () => {
    const { logger } = createRecordingLogger();
    const down = provider('anthropic', ['transient']);
    const retired = provider('anthropic', ['config']);

    await expect(createFailoverModelProvider({ logger, providers: [down] }).answer(PROMPT)).rejects.toMatchObject({
      kind: 'transient',
    });
    expect(down.calls).toBe(MODEL.MAX_ATTEMPTS);

    await expect(createFailoverModelProvider({ logger, providers: [retired] }).answer(PROMPT)).rejects.toMatchObject({
      kind: 'config',
    });
    expect(retired.calls).toBe(1);
  });

  it('fits two attempts of the full attempt timeout inside the call bound', async () => {
    const clock = fakeClock();
    const primary = provider('anthropic', ['transient'], { clock, latencyMs: MODEL.ATTEMPT_TIMEOUT_MS });
    const secondary = provider('openai', ['From OpenAI.'], { clock, latencyMs: MODEL.ATTEMPT_TIMEOUT_MS });
    const { logger } = createRecordingLogger();

    await expect(
      createFailoverModelProvider({ logger, now: clock.now, providers: [primary, secondary] }).answer(PROMPT),
    ).resolves.toBe('From OpenAI.');
    expect(clock.now()).toBeLessThanOrEqual(MODEL.CALL_TIMEOUT_MS);
  });

  it('fails over after a real timeout, which fires a little after the attempt timeout', async () => {
    const clock = fakeClock();
    const hung = provider('anthropic', ['transient'], { clock, latencyMs: MODEL.ATTEMPT_TIMEOUT_MS + 20 });
    const secondary = provider('openai', ['From OpenAI.'], { clock, latencyMs: MODEL.ATTEMPT_TIMEOUT_MS });
    const { logger } = createRecordingLogger();

    await expect(
      createFailoverModelProvider({ logger, now: clock.now, providers: [hung, secondary] }).answer(PROMPT),
    ).resolves.toBe('From OpenAI.');
    expect(secondary.calls).toBe(1);
    expect(clock.now()).toBeLessThanOrEqual(MODEL.CALL_TIMEOUT_MS);
  });

  it('starts no attempt that could end past the call bound', async () => {
    const clock = fakeClock();
    const slow = { clock, latencyMs: MODEL.CALL_TIMEOUT_MS - MODEL.ATTEMPT_TIMEOUT_MS + 1 };
    const primary = provider('anthropic', ['transient'], slow);
    const secondary = provider('openai', ['From OpenAI.'], { clock });
    const only = provider('anthropic', ['transient', 'Too late.'], slow);
    const { logger } = createRecordingLogger();

    await expect(
      createFailoverModelProvider({ logger, now: clock.now, providers: [primary, secondary] }).answer(PROMPT),
    ).rejects.toMatchObject({ provider: 'anthropic' });
    expect(secondary.calls).toBe(0);

    await expect(
      createFailoverModelProvider({ logger, now: clock.now, providers: [only] }).answer(PROMPT),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(only.calls).toBe(1);
  });

  it('skips the primary for the transient cooldown after three failures in a row, logs one warning, then tries it again', async () => {
    const clock = fakeClock();
    const primary = provider('anthropic', ['transient']);
    const secondary = provider('openai', ['From OpenAI.']);
    const { entries, logger } = createRecordingLogger();
    const failover = createFailoverModelProvider({ logger, now: clock.now, providers: [primary, secondary] });

    for (let attempt = 0; attempt < MODEL.BREAKER.FAILURES_TO_OPEN; attempt += 1) await failover.answer(PROMPT);
    expect(primary.calls).toBe(3);

    await failover.answer(PROMPT);
    expect(primary.calls).toBe(3);

    const warnings = levels(entries, 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      cooldownMs: MODEL.BREAKER.TRANSIENT_COOLDOWN_MS,
      model: 'anthropic-model',
      msg: 'model provider skipped after repeated failures',
      provider: 'anthropic',
    });

    clock.advance(MODEL.BREAKER.TRANSIENT_COOLDOWN_MS);
    await failover.answer(PROMPT);
    expect(primary.calls).toBe(4);
  });

  it('opens the config cooldown on one config failure and logs one error naming provider, model, and status', async () => {
    const clock = fakeClock();
    const primary = provider('anthropic', ['config']);
    const secondary = provider('openai', ['From OpenAI.']);
    const { entries, logger } = createRecordingLogger();
    const failover = createFailoverModelProvider({ logger, now: clock.now, providers: [primary, secondary] });

    await failover.answer(PROMPT);
    clock.advance(MODEL.BREAKER.TRANSIENT_COOLDOWN_MS);
    await failover.answer(PROMPT);
    expect(primary.calls).toBe(1);

    const errors = levels(entries, 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ model: 'anthropic-model', provider: 'anthropic', status: 404 });

    clock.advance(MODEL.BREAKER.CONFIG_COOLDOWN_MS);
    await failover.answer(PROMPT);
    expect(primary.calls).toBe(2);
  });

  it('still tries the primary when every breaker is open', async () => {
    const primary = provider('anthropic', ['config', 'Back.']);
    const secondary = provider('openai', ['config']);
    const { logger } = createRecordingLogger();
    const failover = createFailoverModelProvider({ logger, now: () => 0, providers: [primary, secondary] });

    await failover.answer(PROMPT).catch(() => undefined);
    await expect(failover.answer(PROMPT)).resolves.toBe('Back.');
  });

  it('logs provider, model, outcome, latency, and failover, and never the prompt or the answer', async () => {
    const { entries, logger } = createRecordingLogger();
    const failover = createFailoverModelProvider({
      logger,
      providers: [provider('anthropic', ['transient']), provider('openai', ['From OpenAI.'])],
    });

    await failover.answer(PROMPT);

    const line = entries.find((entry) => entry.msg === 'model call' && entry.outcome === 'answered');
    expect(line).toMatchObject({ isFailover: true, model: 'openai-model', provider: 'openai' });
    expect(typeof line?.latencyMs).toBe('number');
    expect(JSON.stringify(entries)).not.toContain('secret question');
    expect(JSON.stringify(entries)).not.toContain('From OpenAI.');
  });
});
