// The model calls behind POST /v1/ask and GET /v1/study-note. Each attempt is bounded at 11
// seconds and the SDKs never retry (an SDK retry waits out retry-after first). The failover
// wrapper makes at most two attempts and starts none that could end after CALL_TIMEOUT_MS, so a
// call ends inside the routes' 25 second target, under the app's 30 second wait.
const ATTEMPT_TIMEOUT_MS = 11_000;

const MODEL = {
  ANTHROPIC_DEFAULT_ID: 'claude-haiku-5-5',
  ATTEMPT_TIMEOUT_MS,
  BREAKER: { CONFIG_COOLDOWN_MS: 900_000, FAILURES_TO_OPEN: 3, TRANSIENT_COOLDOWN_MS: 60_000 },
  CALL_TIMEOUT_MS: 2 * ATTEMPT_TIMEOUT_MS,
  EFFORT: 'low',
  MAX_ATTEMPTS: 2,
  // Thinking tokens count against this too; each prompt asks for a short answer.
  MAX_TOKENS: 2_000,
  SDK_RETRIES: 0,
} as const;

export { MODEL };
