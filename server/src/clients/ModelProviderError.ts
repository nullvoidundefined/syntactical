// A failed model request, classified once for both providers, the failover, and the smoke script.
// `config` means the request cannot succeed until the configuration changes (a retired model, a
// bad key, a forbidden request); `decline` means the vendor refused this prompt, which is final
// and is never sent to the other vendor, so the provider resolves null instead of throwing;
// `transient` means it may succeed on retry. The error is built from the provider, model, status,
// and kind only: the SDK error is dropped because its request carries the learner's message.
type ProviderId = 'anthropic' | 'openai';
type ModelFailureOutcome = 'config' | 'decline' | 'transient';
type ModelFailureKind = Exclude<ModelFailureOutcome, 'decline'>;

const CONFIG_STATUSES = new Set([401, 403, 404]);
// Error codes a vendor sends with a 400 when the prompt itself is refused. OpenAI's Responses API
// answers a prompt its usage-policy screen flags with `invalid_prompt`.
const DECLINE_CODES = new Set(['content_policy_violation', 'invalid_prompt']);

function classifyModelFailure(status: number | null, code: string | null): ModelFailureOutcome {
  if (status !== null && CONFIG_STATUSES.has(status)) return 'config';
  if (status === 400 && code !== null && DECLINE_CODES.has(code)) return 'decline';
  return 'transient';
}

class ModelProviderError extends Error {
  readonly kind: ModelFailureKind;
  readonly model: string;
  readonly provider: ProviderId;
  readonly status: number | null;

  constructor(provider: ProviderId, model: string, status: number | null, kind: ModelFailureKind) {
    super(`${provider} ${model} failed (${kind}${status === null ? '' : `, ${status}`})`);
    this.name = 'ModelProviderError';
    this.kind = kind;
    this.model = model;
    this.provider = provider;
    this.status = status;
  }
}

export { classifyModelFailure, ModelProviderError };
export type { ModelFailureKind, ModelFailureOutcome, ProviderId };
