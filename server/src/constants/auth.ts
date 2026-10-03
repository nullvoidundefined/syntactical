// Auth constants: one-time code shape and lifetime, session lifetimes and cookie name, and
// the rate limits on issuing and verifying codes, and the waits an account deletion may spend.
// One place so routes, middleware, and account deletion agree on the numbers.
const HOUR_MS = 3_600_000;

const AUTH = {
  CODE: {
    DIGITS: 6,
    MAX_ATTEMPTS: 5,
    // Ten minutes.
    TTL_MS: 600_000,
    // crypto.randomInt's exclusive upper bound: every 6-digit code, 000000 to 999999.
    UPPER_BOUND: 1_000_000,
  },
  DELETION: {
    // Postgres lock_timeout for the deletion transaction: how long it waits on the email's
    // advisory lock or a row lock before failing (and rolling back).
    LOCK_TIMEOUT_MS: 5_000,
    // Postgres statement_timeout for the deletion transaction: the cap on any one statement.
    STATEMENT_TIMEOUT_MS: 15_000,
  },
  EMAIL: {
    // The sign-in email is sent inside the issue transaction, so a stalled send must not hold
    // its pooled client and row locks for longer than this.
    SEND_TIMEOUT_MS: 8_000,
  },
  RATE_LIMIT: {
    ISSUE_PER_EMAIL: 5,
    ISSUE_PER_IP: 20,
    // A person mistypes a code a few times; 10 guesses an hour keeps a guess at 1 in 100,000.
    VERIFY_PER_EMAIL: 10,
    VERIFY_PER_IP: 30,
    WINDOW_MS: HOUR_MS,
  },
  RATE_LIMIT_SCOPE: {
    ISSUE_EMAIL: 'code-issue:email',
    ISSUE_IP: 'code-issue:ip',
    VERIFY_EMAIL: 'session-verify:email',
    VERIFY_IP: 'session-verify:ip',
  },
  SESSION: {
    // Thirty days from creation, whatever the use.
    ABSOLUTE_TTL_MS: 2_592_000_000,
    COOKIE_NAME: 'syntactical_session',
    // Fourteen days from last use.
    IDLE_TTL_MS: 1_209_600_000,
    TOKEN_BYTES: 32,
  },
} as const;

export { AUTH };
