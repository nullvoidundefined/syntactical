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

describe('loadEnv without PUBLIC_BASE_URL', () => {
  it('starts without PUBLIC_BASE_URL and never lists it as a stubbed integration', () => {
    expect.soft(() => loadEnv(fullSource())).not.toThrow();

    const env = loadEnv({ ...onlyRequired(), ALLOW_STUBBED_INTEGRATIONS: 'true' });

    expect.soft(env.stubbed).not.toContain('PUBLIC_BASE_URL');
  });
});
