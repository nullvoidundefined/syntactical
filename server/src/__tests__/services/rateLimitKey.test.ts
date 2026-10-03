// B-3.3 (B-63): rate_limit_counters keys are HMAC-SHA256 under RATE_LIMIT_KEY_SECRET, so a
// stored key reveals no email or IP and cannot be brute-forced from a list of candidates.
import { createHash, createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { rateLimitKey } from '../../services/rateLimitKey.js';

const SECRET_BYTES = 32;
const EMAIL_BYTES = 6;
const SCOPE = 'code-issue:email';
const OTHER_SCOPE = 'session-verify:email';

function buildSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

describe('rateLimitKey', () => {
  it('is the scope and the HMAC-SHA256 of the value under the secret', () => {
    const secret = buildSecret();
    const email = buildEmail();

    const key = rateLimitKey(secret, SCOPE, email);

    expect(key).toBe(`${SCOPE}:${createHmac('sha256', secret).update(email).digest('hex')}`);
  });

  it('contains neither the plaintext value nor its unkeyed SHA-256', () => {
    const email = buildEmail();

    const key = rateLimitKey(buildSecret(), SCOPE, email);

    expect(key).not.toContain(email);
    expect(key).not.toContain(createHash('sha256').update(email).digest('hex'));
  });

  it('changes with the secret and with the scope', () => {
    const secret = buildSecret();
    const email = buildEmail();
    const key = rateLimitKey(secret, SCOPE, email);

    expect(rateLimitKey(buildSecret(), SCOPE, email)).not.toBe(key);
    expect(rateLimitKey(secret, OTHER_SCOPE, email)).not.toBe(key);
    expect(rateLimitKey(secret, SCOPE, email)).toBe(key);
  });
});
