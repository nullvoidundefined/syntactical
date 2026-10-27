// REVENUECAT_ACCEPT_SANDBOX: whether the RevenueCat webhook applies SANDBOX events. Absent means
// false, so production never grants Pro from a free sandbox purchase; staging sets it to true. Only
// `true` and `false` are accepted, and the error names the variable, never the value.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

const SECRET_BYTES = 24;

function buildValidSource(): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    DATABASE_URL: 'postgres://localhost:5432/syntactical',
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    RATE_LIMIT_KEY_SECRET: randomBytes(SECRET_BYTES).toString('hex'),
    RESEND_API_KEY: randomBytes(SECRET_BYTES).toString('hex'),
    REVENUECAT_WEBHOOK_AUTH: randomBytes(SECRET_BYTES).toString('hex'),
  };
}

describe('loadEnv REVENUECAT_ACCEPT_SANDBOX', () => {
  it('is false when absent', () => {
    expect(loadEnv(buildValidSource()).REVENUECAT_ACCEPT_SANDBOX).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads %s as %s', (value, expected) => {
    expect(loadEnv({ ...buildValidSource(), REVENUECAT_ACCEPT_SANDBOX: value }).REVENUECAT_ACCEPT_SANDBOX).toBe(
      expected,
    );
  });

  it.each(['TRUE', '1', 'yes', ' true', ''])('refuses %j, naming the variable and not the value', (value) => {
    const load = () => loadEnv({ ...buildValidSource(), REVENUECAT_ACCEPT_SANDBOX: value });

    expect(load).toThrow('Invalid environment: REVENUECAT_ACCEPT_SANDBOX');
  });
});
