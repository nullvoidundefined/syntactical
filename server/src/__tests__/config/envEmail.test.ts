// B-3.3: the email client's settings are required at startup and never echoed.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

const RANDOM_BYTES = 24;
const SENDER = 'Syntactical <sign-in@syntactical.dev>';

function buildValidSource(): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    DATABASE_URL: 'postgres://localhost:5432/syntactical',
    EMAIL_FROM: SENDER,
    NODE_ENV: 'test',
    PAID_CONTENT_DIR: '/srv/syntactical-content',
    PUBLIC_BASE_URL: 'https://api.syntactical.dev',
    RATE_LIMIT_KEY_SECRET: randomBytes(RANDOM_BYTES).toString('hex'),
    RESEND_API_KEY: randomBytes(RANDOM_BYTES).toString('hex'),
    REVENUECAT_WEBHOOK_AUTH: randomBytes(RANDOM_BYTES).toString('hex'),
  };
}

function captureError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  return expect.unreachable('expected loadEnv to throw');
}

describe('loadEnv email settings', () => {
  it('returns the Resend key and the sender', () => {
    const source = buildValidSource();

    const { EMAIL_FROM, RESEND_API_KEY } = loadEnv(source);

    expect(RESEND_API_KEY).toBe(source.RESEND_API_KEY);
    expect(EMAIL_FROM).toBe(SENDER);
  });

  it.each(['RESEND_API_KEY', 'EMAIL_FROM'])('fails naming %s when it is missing or blank', (name) => {
    const missing = buildValidSource();
    delete missing[name];
    const blank = { ...buildValidSource(), [name]: '   ' };

    expect(captureError(() => loadEnv(missing)).message).toContain(name);
    expect(captureError(() => loadEnv(blank)).message).toContain(name);
  });

  it('never echoes the Resend key when another variable fails', () => {
    const valid = buildValidSource();
    const source = { ...valid, DATABASE_URL: '' };

    const error = captureError(() => loadEnv(source));

    expect(`${error.message}\n${String(error)}`).not.toContain(String(valid.RESEND_API_KEY));
  });
});
