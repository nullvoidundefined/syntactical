// The pool's TLS posture and error handling. Production verifies the database certificate; no
// input yields rejectUnauthorized false; a pool error is logged by name and code only.
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { buildPoolConfig, createDatabasePool } from '../../clients/createDatabasePool.js';

const PUBLIC_URL = 'postgres://app@db.example.com:5432/app';
const PRIVATE_URL = 'postgres://app@db.railway.internal:5432/app';

describe('buildPoolConfig', () => {
  it('verifies the certificate on a public host in production', () => {
    expect(buildPoolConfig(PUBLIC_URL, 'production').ssl).toEqual({ rejectUnauthorized: true });
  });

  it('keeps verification when the URL asks for require or verify-full', () => {
    for (const mode of ['require', 'verify-ca', 'verify-full']) {
      const { connectionString, ssl } = buildPoolConfig(`${PUBLIC_URL}?sslmode=${mode}`, 'production');
      expect(ssl).toEqual({ rejectUnauthorized: true });
      expect(connectionString).not.toContain('sslmode');
    }
  });

  it('refuses a URL that asks for no or unverified TLS on a public host in production', () => {
    for (const mode of ['disable', 'allow', 'prefer', 'no-verify']) {
      expect(() => buildPoolConfig(`${PUBLIC_URL}?sslmode=${mode}`, 'production')).toThrow(/unverified TLS/);
    }
  });

  it('turns TLS off only on Railway private networking', () => {
    expect(buildPoolConfig(PRIVATE_URL, 'production').ssl).toBe(false);
  });

  it('never sets rejectUnauthorized false for any production URL', () => {
    for (const url of [PUBLIC_URL, `${PUBLIC_URL}?sslmode=require`, PRIVATE_URL]) {
      const { ssl } = buildPoolConfig(url, 'production');
      expect(ssl === false || (typeof ssl === 'object' && ssl.rejectUnauthorized === true)).toBe(true);
    }
  });

  it('passes the URL through unchanged outside production', () => {
    expect(buildPoolConfig(PUBLIC_URL, 'development')).toEqual({ connectionString: PUBLIC_URL });
    expect(buildPoolConfig(PUBLIC_URL, 'test')).toEqual({ connectionString: PUBLIC_URL });
  });
});

describe('createDatabasePool', () => {
  it('logs a pool error by name and pg code, never the message', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'trace' }, { write: (chunk: string) => lines.push(chunk) });
    const pool = createDatabasePool('postgres://app@localhost:1/app', 'test', logger);
    const message = 'detail-that-must-not-be-logged';
    pool.emit('error', Object.assign(new Error(message), { code: '57P01' }), undefined as never);
    await pool.end();

    const logged = lines.join('');
    expect(logged).toContain('57P01');
    expect(logged).toContain('"errorName":"Error"');
    expect(logged).not.toContain(message);
  });
});
