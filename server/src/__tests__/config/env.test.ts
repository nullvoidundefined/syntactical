// B-62a: zod-validated environment that fails closed and never echoes a provided value.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

const WEBHOOK_AUTH_MIN_LENGTH = 32;
const RANDOM_SECRET_BYTES = 24;
const DATABASE_NAME_SUFFIX_LENGTH = 8;
const REQUIRED_VARIABLES = [
  'DATABASE_URL',
  'REVENUECAT_WEBHOOK_AUTH',
  'RATE_LIMIT_KEY_SECRET',
  'ALLOWED_ORIGINS',
] as const;

function randomText(length: number): string {
  return randomBytes(length).toString('hex').slice(0, length);
}

function buildValidSource(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: `postgres://localhost:5432/syntactical_${randomText(DATABASE_NAME_SUFFIX_LENGTH)}`,
    REVENUECAT_WEBHOOK_AUTH: randomBytes(RANDOM_SECRET_BYTES).toString('hex'),
    RATE_LIMIT_KEY_SECRET: randomBytes(RANDOM_SECRET_BYTES).toString('hex'),
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    PUBLIC_BASE_URL: 'https://api.syntactical.dev',
    RESEND_API_KEY: randomBytes(RANDOM_SECRET_BYTES).toString('hex'),
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
  };
}

function captureError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected loadEnv to throw');
}

function errorText(error: Error): string {
  return `${error.message}\n${JSON.stringify(error)}\n${String(error)}`;
}

describe('loadEnv', () => {
  it('returns the parsed env when every required variable is valid', () => {
    const source = buildValidSource();

    const env = loadEnv(source);

    expect(env.DATABASE_URL).toBe(source.DATABASE_URL);
    expect(env.REVENUECAT_WEBHOOK_AUTH).toBe(source.REVENUECAT_WEBHOOK_AUTH);
  });

  it('accepts a webhook auth secret of exactly the minimum length', () => {
    const source = { ...buildValidSource(), REVENUECAT_WEBHOOK_AUTH: randomText(WEBHOOK_AUTH_MIN_LENGTH) };

    expect(loadEnv(source).REVENUECAT_WEBHOOK_AUTH).toBe(source.REVENUECAT_WEBHOOK_AUTH);
  });

  it('fails when the webhook auth secret is one character short, without echoing it', () => {
    const shortSecret = randomText(WEBHOOK_AUTH_MIN_LENGTH - 1);
    const source = { ...buildValidSource(), REVENUECAT_WEBHOOK_AUTH: shortSecret };

    const error = captureError(() => loadEnv(source));

    expect(error.message).toContain('REVENUECAT_WEBHOOK_AUTH');
    expect(errorText(error)).not.toContain(shortSecret);
  });

  it('fails when the webhook auth secret is empty', () => {
    const source = { ...buildValidSource(), REVENUECAT_WEBHOOK_AUTH: '' };

    expect(() => loadEnv(source)).toThrow(/REVENUECAT_WEBHOOK_AUTH/);
  });

  it('fails when the rate-limit key secret is one character short or empty, without echoing it', () => {
    const shortSecret = randomText(WEBHOOK_AUTH_MIN_LENGTH - 1);
    const short = { ...buildValidSource(), RATE_LIMIT_KEY_SECRET: shortSecret };
    const empty = { ...buildValidSource(), RATE_LIMIT_KEY_SECRET: '' };

    const error = captureError(() => loadEnv(short));

    expect(error.message).toContain('RATE_LIMIT_KEY_SECRET');
    expect(errorText(error)).not.toContain(shortSecret);
    expect(() => loadEnv(empty)).toThrow(/RATE_LIMIT_KEY_SECRET/);
  });

  it.each(REQUIRED_VARIABLES)('fails when %s is missing, naming it and echoing no provided value', (missingVariable) => {
    const source = buildValidSource();
    delete source[missingVariable];
    const providedValues = Object.values(source).filter(
      (value): value is string => typeof value === 'string' && value !== 'test',
    );

    const error = captureError(() => loadEnv(source));

    expect(error.message).toContain(missingVariable);
    const text = errorText(error);
    for (const value of providedValues) {
      expect(text).not.toContain(value);
    }
  });
});
