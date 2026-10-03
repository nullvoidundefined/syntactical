// B-62f: findings from the PR #19 security review, round 3. Grandchild loggers
// work and keep their parent's bindings; pg payload fields copied onto plain
// objects are redacted; absolute URLs come from PUBLIC_BASE_URL, and
// X-Forwarded-Proto cannot flip req.protocol.
import { randomBytes } from 'node:crypto';

import type { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createLogger } from '../../clients/logger.js';
import { loadEnv } from '../../config/env.js';

const HTTP_OK = 200;
const TOKEN_BYTES = 12;

function capture() {
  const lines: string[] = [];
  return {
    destination: {
      write(chunk: string) {
        lines.push(...chunk.split('\n').filter((line) => line.length > 0));
      },
    },
    lines,
  };
}

function runTimeEmail(): string {
  return `${randomBytes(TOKEN_BYTES).toString('hex')}@example.test`;
}

function secret(): string {
  return randomBytes(TOKEN_BYTES * 2).toString('hex');
}

function envWith(publicBaseUrl: string | undefined): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    DATABASE_URL: `postgres-url-${secret()}`,
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    PUBLIC_BASE_URL: publicBaseUrl,
    RATE_LIMIT_KEY_SECRET: secret(),
    RESEND_API_KEY: secret(),
    REVENUECAT_WEBHOOK_AUTH: secret(),
  };
}

describe('grandchild loggers', () => {
  it('logs from a grandchild with the parent binding and a redacted email', () => {
    const email = runTimeEmail();
    const { destination, lines } = capture();
    const child = createLogger({ destination }).child({ requestId: 'req-1' });
    let grandchild: ReturnType<typeof child.child> | undefined;
    expect(() => {
      grandchild = child.child({ email, userId: 'u-1' });
    }).not.toThrow();
    grandchild?.info('probe');
    const entry = JSON.parse(lines[0] ?? '{}');
    expect(entry.requestId).toBe('req-1');
    expect(entry.userId).toBe('u-1');
    expect(lines.join('\n')).not.toContain(email);
  });

  it('works through a route that derives a child from the request logger', async () => {
    const { destination, lines } = capture();
    const app = createApp({
      db: { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) },
      extraRoutes: (router: Router) => {
        router.get('/scoped', (_req, res) => {
          res.locals.logger.child({ scope: 'auth' }).info('scoped');
          res.status(HTTP_OK).json({ ok: true });
        });
      },
      logger: createLogger({ destination }),
    });
    const response = await request(app).get('/scoped');
    expect(response.status).toBe(HTTP_OK);
    const scoped = lines.map((line) => JSON.parse(line)).find((entry) => entry.msg === 'scoped');
    expect(scoped?.requestId).toBe(response.headers['x-request-id']);
  });
});

describe('pg payload fields on plain objects', () => {
  it.each(['detail', 'hint', 'where', 'internalQuery', 'routine', 'column', 'stack'])(
    'redacts %s',
    (key) => {
      const email = runTimeEmail();
      const { destination, lines } = capture();
      createLogger({ destination }).info({ failure: { [key]: `value for ${email}` } }, 'probe');
      expect(lines.join('\n')).not.toContain(email);
    },
  );

  it('redacts the message of a spread pg error', () => {
    const email = runTimeEmail();
    const pgError = Object.assign(new Error(`duplicate key for ${email}`), {
      code: '23505',
      detail: `Key (email)=(${email}) already exists.`,
    });
    const { destination, lines } = capture();
    createLogger({ destination }).info(
      { failure: { ...pgError, message: pgError.message, stack: pgError.stack } },
      'probe',
    );
    expect(lines.join('\n')).not.toContain(email);
  });
});

describe('request identity', () => {
  it('never takes req.protocol from X-Forwarded-Proto', async () => {
    let seenProtocol = '';
    const app = createApp({
      db: { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) },
      extraRoutes: (router: Router) => {
        router.get('/proto', (req, res) => {
          seenProtocol = req.protocol;
          res.status(HTTP_OK).json({ ok: true });
        });
      },
      logger: createLogger({ destination: capture().destination }),
    });
    await request(app).get('/proto').set('X-Forwarded-Proto', 'https');
    expect(seenProtocol).toBe('http');
  });

  it('requires PUBLIC_BASE_URL to be an https URL', () => {
    expect(() => loadEnv(envWith(undefined))).toThrow('PUBLIC_BASE_URL');
    expect(() => loadEnv(envWith('http://api.syntactical.dev'))).toThrow('PUBLIC_BASE_URL');
    expect(() => loadEnv(envWith('not a url'))).toThrow('PUBLIC_BASE_URL');
    expect(loadEnv(envWith('https://api.syntactical.dev')).PUBLIC_BASE_URL).toBe('https://api.syntactical.dev');
  });
});
