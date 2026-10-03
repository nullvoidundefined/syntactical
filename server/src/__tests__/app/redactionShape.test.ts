// B-62g: findings from the PR #19 security review, round 4. A spread pg error
// without detail still has its message censored, and PUBLIC_BASE_URL is a
// clean, normalized https origin with no credentials, query, or fragment.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../../clients/logger.js';
import { loadEnv } from '../../config/env.js';

const TOKEN_BYTES = 12;

function capture() {
  const lines: string[] = [];
  return { destination: { write: (chunk: string) => lines.push(chunk) }, lines };
}

function secret(): string {
  return randomBytes(TOKEN_BYTES * 2).toString('hex');
}

function envWith(publicBaseUrl: string): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    DATABASE_URL: `postgres-url-${secret()}`,
    PUBLIC_BASE_URL: publicBaseUrl,
    RATE_LIMIT_KEY_SECRET: secret(),
    REVENUECAT_WEBHOOK_AUTH: secret(),
  };
}

describe('error-shaped plain objects without detail', () => {
  it.each([
    ['code and message', (value: string) => ({ code: '22P02', message: `invalid input syntax for type uuid: "${value}"` })],
    ['severity and message', (value: string) => ({ message: `bad value ${value}`, severity: 'ERROR' })],
    ['routine and message', (value: string) => ({ message: `bad value ${value}`, routine: 'string_to_uuid' })],
    ['constraint and message', (value: string) => ({ constraint: 'users_pkey', message: `dup ${value}` })],
  ])('censors the message of an object with %s', (_label, shape) => {
    const value = randomBytes(TOKEN_BYTES).toString('hex');
    const { destination, lines } = capture();
    createLogger({ destination }).info({ failure: shape(value) }, 'probe');
    expect(lines.join('\n')).not.toContain(value);
  });
});

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
