// Stub mode: a missing integration is satisfied by a stub only under ALLOW_STUBBED_INTEGRATIONS=true.
// Every value is built at run time, so no credential-shaped literal sits in source.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

const SECRET_BYTES = 24;
const STUBBABLE_NAMES = [
  'ALLOWED_ORIGINS',
  'EMAIL_FROM',
  'PUBLIC_BASE_URL',
  'RATE_LIMIT_KEY_SECRET',
  'RESEND_API_KEY',
  'REVENUECAT_WEBHOOK_AUTH',
] as const;

function randomSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

function onlyRequired(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: `postgres://localhost:5432/syntactical_${randomBytes(4).toString('hex')}`,
    NODE_ENV: 'test',
    PAID_CONTENT_DIR: '/srv/syntactical-content',
  };
}

function fullSource(): NodeJS.ProcessEnv {
  return {
    ...onlyRequired(),
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    PUBLIC_BASE_URL: 'https://api.syntactical.dev',
    RATE_LIMIT_KEY_SECRET: randomSecret(),
    RESEND_API_KEY: randomSecret(),
    REVENUECAT_WEBHOOK_AUTH: randomSecret(),
  };
}

describe('loadEnv without the stub opt-in', () => {
  it.each(STUBBABLE_NAMES)('refuses to start when %s is missing', (name) => {
    const source = fullSource();
    delete source[name];

    expect(() => loadEnv(source)).toThrow(new RegExp(name));
  });

  it.each(['1', 'TRUE', 'yes', 'false', ''])('does not treat ALLOW_STUBBED_INTEGRATIONS=%j as the opt-in', (value) => {
    const source = { ...onlyRequired(), ALLOW_STUBBED_INTEGRATIONS: value };

    expect(() => loadEnv(source)).toThrow(/Invalid environment/);
  });

  it('reports no stubs for a complete environment', () => {
    expect(loadEnv(fullSource()).stubbed).toEqual([]);
  });
});

describe('loadEnv with ALLOW_STUBBED_INTEGRATIONS=true', () => {
  const optIn = { ALLOW_STUBBED_INTEGRATIONS: 'true' };

  it('starts with only the database and paid content settings, and lists every stub by name', () => {
    const env = loadEnv({ ...onlyRequired(), ...optIn });

    expect([...env.stubbed].sort()).toEqual([...STUBBABLE_NAMES].sort());
  });

  it('never stubs DATABASE_URL', () => {
    const source: NodeJS.ProcessEnv = { ...onlyRequired(), ...optIn };
    delete source.DATABASE_URL;

    expect(() => loadEnv(source)).toThrow(/DATABASE_URL/);
  });

  it('never stubs PAID_CONTENT_DIR', () => {
    const source: NodeJS.ProcessEnv = { ...onlyRequired(), ...optIn };
    delete source.PAID_CONTENT_DIR;

    expect(() => loadEnv(source)).toThrow(/PAID_CONTENT_DIR/);
  });

  it('leaves the email credential and the webhook credential absent, never a placeholder', () => {
    const env = loadEnv({ ...onlyRequired(), ...optIn });

    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.REVENUECAT_WEBHOOK_AUTH).toBeUndefined();
  });

  it('allows no browser origin when ALLOWED_ORIGINS is missing', () => {
    expect(loadEnv({ ...onlyRequired(), ...optIn }).ALLOWED_ORIGINS).toBe('');
  });

  it('generates a fresh 32-byte rate limit secret on every load', () => {
    const first = loadEnv({ ...onlyRequired(), ...optIn }).RATE_LIMIT_KEY_SECRET;
    const second = loadEnv({ ...onlyRequired(), ...optIn }).RATE_LIMIT_KEY_SECRET;

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it('stubs only what is missing and keeps the values that are set', () => {
    const source: NodeJS.ProcessEnv = { ...fullSource(), ...optIn };
    delete source.RESEND_API_KEY;

    const env = loadEnv(source);

    expect(env.stubbed).toEqual(['RESEND_API_KEY']);
    expect(env.REVENUECAT_WEBHOOK_AUTH).toBe(source.REVENUECAT_WEBHOOK_AUTH);
    expect(env.RATE_LIMIT_KEY_SECRET).toBe(source.RATE_LIMIT_KEY_SECRET);
    expect(env.ALLOWED_ORIGINS).toBe(source.ALLOWED_ORIGINS);
  });

  it('treats a blank value as missing', () => {
    const source: NodeJS.ProcessEnv = { ...fullSource(), ...optIn, RESEND_API_KEY: '   ' };

    expect(loadEnv(source).stubbed).toEqual(['RESEND_API_KEY']);
  });

  it('still refuses a present but invalid value, without echoing it', () => {
    const shortSecret = randomBytes(4).toString('hex');
    const source: NodeJS.ProcessEnv = { ...fullSource(), ...optIn, REVENUECAT_WEBHOOK_AUTH: shortSecret };

    const failure = (() => {
      try {
        loadEnv(source);
      } catch (error) {
        return error as Error;
      }
      throw new Error('expected loadEnv to throw');
    })();

    expect(failure.message).toContain('REVENUECAT_WEBHOOK_AUTH');
    expect(failure.message).not.toContain(shortSecret);
  });
});
