// Auth constants: one-time code shape and lifetime, and the rate limits on issuing codes.
// One place so the issue route, the tests, and account deletion agree on the numbers.
const HOUR_MS = 3_600_000;

const AUTH = {
  CODE: {
    DIGITS: 6,
    // Ten minutes.
    TTL_MS: 600_000,
    // crypto.randomInt's exclusive upper bound: every 6-digit code, 000000 to 999999.
    UPPER_BOUND: 1_000_000,
  },
  RATE_LIMIT: {
    ISSUE_PER_EMAIL: 5,
    ISSUE_PER_IP: 20,
    WINDOW_MS: HOUR_MS,
  },
  RATE_LIMIT_SCOPE: {
    ISSUE_EMAIL: 'code-issue:email',
    ISSUE_IP: 'code-issue:ip',
  },
} as const;

export { AUTH };
