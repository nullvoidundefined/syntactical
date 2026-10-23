// Limits for POST /v1/ask: how many answers a user gets per UTC day, how long an asked question may
// be, and the model call's bounds. Haiku at low effort keeps an answer at a fraction of a cent.
const MINUTE_MS = 60_000;

const ASK = {
  // Counts answers given; a refused or failed ask does not use one up.
  DAILY_LIMIT: 20,
  MAX_QUESTION_LENGTH: 500,
  MODEL: {
    EFFORT: 'low',
    ID: 'claude-haiku-5-5',
    // One retry on a 429, 5xx, or dropped connection. With the timeout, an ask resolves within about
    // 25 seconds, under the app's 30 second wait for this route.
    MAX_RETRIES: 1,
    // Thinking tokens count against this too; the prompt asks for a short answer.
    MAX_TOKENS: 2_000,
    TIMEOUT_MS: 12_000,
  },
  // A burst guard under the daily limit; every request counts here, refused ones included.
  RATE_LIMIT: { PER_USER: 10, WINDOW_MS: MINUTE_MS },
  RATE_LIMIT_SCOPE: 'ask',
} as const;

export { ASK };
