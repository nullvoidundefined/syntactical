// B-37a: PAID_CONTENT_DIR is required at startup as an absolute path, and a refused value is
// never echoed in the error.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

const RANDOM_BYTES = 24;
const NAME_BYTES = 6;

function randomName(): string {
  return randomBytes(NAME_BYTES).toString('hex');
}

function buildValidSource(): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    DATABASE_URL: 'postgres://localhost:5432/syntactical',
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    NODE_ENV: 'test',
    PAID_CONTENT_DIR: `/srv/syntactical-content-${randomName()}`,
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

function errorText(error: Error): string {
  return `${error.message}\n${JSON.stringify(error)}\n${String(error)}`;
}

describe('loadEnv PAID_CONTENT_DIR', () => {
  it('returns an absolute PAID_CONTENT_DIR', () => {
    const source = buildValidSource();

    expect(loadEnv(source).PAID_CONTENT_DIR).toBe(source.PAID_CONTENT_DIR);
  });

  it('fails naming PAID_CONTENT_DIR when it is missing, empty, or blank', () => {
    const missing = buildValidSource();
    delete missing.PAID_CONTENT_DIR;
    const empty = { ...buildValidSource(), PAID_CONTENT_DIR: '' };
    const blank = { ...buildValidSource(), PAID_CONTENT_DIR: '   ' };

    expect(captureError(() => loadEnv(missing)).message).toContain('PAID_CONTENT_DIR');
    expect(captureError(() => loadEnv(empty)).message).toContain('PAID_CONTENT_DIR');
    expect(captureError(() => loadEnv(blank)).message).toContain('PAID_CONTENT_DIR');
  });

  it.each([
    ['a bare relative path', (name: string) => `content/private-${name}`],
    ['a dot-relative path', (name: string) => `./paid-${name}`],
    ['a parent-relative path', (name: string) => `../syntactical-content-${name}`],
  ])('fails naming PAID_CONTENT_DIR for %s, without echoing it', (_label, build) => {
    const value = build(randomName());
    const source = { ...buildValidSource(), PAID_CONTENT_DIR: value };

    const error = captureError(() => loadEnv(source));

    expect(error.message).toContain('PAID_CONTENT_DIR');
    expect(errorText(error)).not.toContain(value);
  });
});
