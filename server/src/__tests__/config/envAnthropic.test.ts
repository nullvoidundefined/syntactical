// ANTHROPIC_API_KEY is optional: without it the server boots and POST /v1/ask answers 503. A key
// that is present but blank still fails, and the error never echoes a value.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

const SECRET_BYTES = 24;

function buildValidSource(): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    DATABASE_URL: 'postgres://localhost:5432/syntactical',
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    NODE_ENV: 'test',
    PAID_CONTENT_DIR: '/srv/syntactical-content',
    RATE_LIMIT_KEY_SECRET: randomBytes(SECRET_BYTES).toString('hex'),
    RESEND_API_KEY: randomBytes(SECRET_BYTES).toString('hex'),
    REVENUECAT_WEBHOOK_AUTH: randomBytes(SECRET_BYTES).toString('hex'),
  };
}

describe('loadEnv ANTHROPIC_API_KEY', () => {
  it('leaves the key undefined when it is not set', () => {
    expect(loadEnv(buildValidSource()).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('passes a set key through trimmed', () => {
    const key = randomBytes(SECRET_BYTES).toString('hex');

    expect(loadEnv({ ...buildValidSource(), ANTHROPIC_API_KEY: ` ${key} ` }).ANTHROPIC_API_KEY).toBe(key);
  });

  it('refuses a blank key, naming the variable only', () => {
    expect(() => loadEnv({ ...buildValidSource(), ANTHROPIC_API_KEY: '   ' })).toThrow(
      'Invalid environment: ANTHROPIC_API_KEY',
    );
  });
});
