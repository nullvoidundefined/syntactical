// B-62g: PUBLIC_BASE_URL is a clean, normalized https origin with no credentials,
// query, or fragment.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

const TOKEN_BYTES = 12;

function secret(): string {
  return randomBytes(TOKEN_BYTES * 2).toString('hex');
}

function envWith(publicBaseUrl: string): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    DATABASE_URL: `postgres-url-${secret()}`,
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    PAID_CONTENT_DIR: '/srv/syntactical-content',
    PUBLIC_BASE_URL: publicBaseUrl,
    RATE_LIMIT_KEY_SECRET: secret(),
    RESEND_API_KEY: secret(),
    REVENUECAT_WEBHOOK_AUTH: secret(),
  };
}

describe('PUBLIC_BASE_URL shape', () => {
  it.each([
    ['userinfo', `https://user:${secret()}@api.syntactical.dev`],
    ['a query', 'https://api.syntactical.dev/?q=1'],
    ['a fragment', 'https://api.syntactical.dev/#f'],
  ])('refuses a URL with %s', (_label, value) => {
    expect(() => loadEnv(envWith(value))).toThrow('PUBLIC_BASE_URL');
  });

  it('stores a trimmed, normalized value', () => {
    expect(loadEnv(envWith('  https://API.syntactical.dev  ')).PUBLIC_BASE_URL).toBe('https://api.syntactical.dev');
  });

  it('never echoes a refused URL', () => {
    const password = secret();
    let message = '';
    try {
      loadEnv(envWith(`https://user:${password}@api.syntactical.dev`));
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('PUBLIC_BASE_URL');
    expect(message).not.toContain(password);
  });
});
