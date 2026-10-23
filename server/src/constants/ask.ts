// Limits for POST /v1/ask: how many answers a user gets per UTC day, how long an asked question may
// be, and the burst limit. The model call's bounds are in constants/model.ts.
const MINUTE_MS = 60_000;

const ASK = {
  // Counts answers given; a refused or failed ask does not use one up.
  DAILY_LIMIT: 20,
  MAX_QUESTION_LENGTH: 500,
  // A burst guard under the daily limit; every request counts here, refused ones included.
  RATE_LIMIT: { PER_USER: 10, WINDOW_MS: MINUTE_MS },
  RATE_LIMIT_SCOPE: 'ask',
} as const;

export { ASK };
