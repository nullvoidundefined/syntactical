// Auth constants: one-time code shape and lifetime, session lifetimes and cookie name, and
// the rate limits on issuing and verifying codes. One place so routes, middleware, and
// account deletion agree on the numbers.
const HOUR_MS = 3_600_000;

const AUTH = {
  BREACH_CHECK: {
    // The k-anonymity range lookup fails open, so it must not hold a sign-up for longer than this.
    MAX_RESPONSE_BYTES: 262_144,
    TIMEOUT_MS: 2_000,
  },
  CODE: {
    DIGITS: 6,
    MAX_ATTEMPTS: 5,
    // Ten minutes.
    TTL_MS: 600_000,
    // crypto.randomInt's exclusive upper bound: every 6-digit code, 000000 to 999999.
    UPPER_BOUND: 1_000_000,
  },
  EMAIL: {
    // The sign-in email is sent inside the issue transaction, so a stalled send must not hold
    // its pooled client and row locks for longer than this.
    SEND_TIMEOUT_MS: 8_000,
  },
  PASSWORD: {
    HASH: {
      KEY_BYTES: 64,
      // log2 of the scrypt cost N: 2^17 = 131072.
      LOG_N: 17,
      // 256 MiB: scrypt needs about 128 * N * r bytes (128 MiB here), so this leaves headroom.
      MAXMEM: 268_435_456,
      P: 1,
      R: 8,
      SALT_BYTES: 32,
    },
    // How long a derivation waits for a free hash slot before the request fails as busy.
    HASH_QUEUE_TIMEOUT_MS: 5_000,
    MAX_LENGTH: 128,
    MIN_LENGTH: 12,
    // UTF-16 units of the raw string, measured before NFKC, so normalization cannot be fed a huge input.
    RAW_MAX_LENGTH: 512,
    // A code session this young (inclusive) may set a password without the current one.
    REAUTH_WINDOW_MS: 600_000,
  },
  RATE_LIMIT: {
    ISSUE_PER_EMAIL: 5,
    ISSUE_PER_IP: 20,
    // Password set or change: every attempt counts, whatever it returns.
    PASSWORD_CHANGE_PER_USER: 10,
    // Password sign-in: a wrong password is a guess, so the email cap is the guessing cap.
    PASSWORD_SIGN_IN_PER_EMAIL: 10,
    PASSWORD_SIGN_IN_PER_IP: 30,
    // A person mistypes a code a few times; 10 guesses an hour keeps a guess at 1 in 100,000.
    VERIFY_PER_EMAIL: 10,
    VERIFY_PER_IP: 30,
    WINDOW_MS: HOUR_MS,
  },
  RATE_LIMIT_SCOPE: {
    ISSUE_EMAIL: 'code-issue:email',
    ISSUE_IP: 'code-issue:ip',
    PASSWORD_CHANGE_USER: 'password-change:user',
    PASSWORD_SIGN_IN_EMAIL: 'password-sign-in:email',
    PASSWORD_SIGN_IN_IP: 'password-sign-in:ip',
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
