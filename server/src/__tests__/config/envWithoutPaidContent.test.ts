// server/src/__tests__/config/envWithoutPaidContent.test.ts
// Area 2: every bank is public, so the server starts with no PAID_CONTENT_DIR. A complete
// environment without it loads, the result carries no such key, and stub mode starts with
// DATABASE_URL alone. Every secret is built at run time.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

const SECRET_BYTES = 24;

function randomSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

function onlyRequired(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: `postgres://localhost:5432/syntactical_${randomBytes(4).toString('hex')}`,
    NODE_ENV: 'test',
  };
}

function fullSource(): NodeJS.ProcessEnv {
  return {
    ...onlyRequired(),
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    RATE_LIMIT_KEY_SECRET: randomSecret(),
    RESEND_API_KEY: randomSecret(),
    REVENUECAT_WEBHOOK_AUTH: randomSecret(),
  };
}

describe('loadEnv without PAID_CONTENT_DIR', () => {
  it('loads a complete environment that has no PAID_CONTENT_DIR', () => {
    const env = loadEnv(fullSource());

    expect(env.stubbed).toEqual([]);
    expect(Object.keys(env)).not.toContain('PAID_CONTENT_DIR');
  });

  it('starts in stub mode with DATABASE_URL alone', () => {
    const env = loadEnv({ ...onlyRequired(), ALLOW_STUBBED_INTEGRATIONS: 'true' });

    expect(env.DATABASE_URL).toMatch(/^postgres:\/\/localhost:5432\/syntactical_/);
  });

  it('ignores a leftover PAID_CONTENT_DIR, even a relative one', () => {
    const env = loadEnv({ ...fullSource(), PAID_CONTENT_DIR: 'content/private' });

    expect(Object.keys(env)).not.toContain('PAID_CONTENT_DIR');
  });
});
