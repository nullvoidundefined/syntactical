// B-62d: findings from the PR #19 reviews. Exactly one proxy hop is trusted; client-class errors answer 4xx;
// secrets need real length; request logs carry route templates, not raw paths.
import { randomBytes } from 'node:crypto';

import type { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createLogger } from '../../clients/logger.js';
import { loadEnv } from '../../config/env.js';

const HTTP_OK = 200;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SECRET_BYTES = 24;
const SECRET_MIN_LENGTH = 32;
const TOKEN_BYTES = 16;

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

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function token(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function okDb() {
  return { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) };
}

function secret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

function validEnv(): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    PUBLIC_BASE_URL: 'https://api.syntactical.dev',
    DATABASE_URL: `postgres-url-${token()}`,
    RATE_LIMIT_KEY_SECRET: secret(),
    REVENUECAT_WEBHOOK_AUTH: secret(),
  };
}

describe('proxy trust', () => {
  it('takes req.ip from the one trusted hop and ignores a spoofed leftmost entry', async () => {
    let seenIp = '';
    const app = createApp({
      db: okDb(),
      extraRoutes: (router: Router) => {
        router.get('/ip', (req, res) => {
          seenIp = req.ip ?? '';
          res.status(HTTP_OK).json({ ok: true });
        });
      },
      logger: createLogger({ destination: capture().destination }),
    });
    await request(app).get('/ip').set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
    expect(seenIp).toBe('203.0.113.7');
  });
});

describe('client-class errors', () => {
  it('answers an unsupported charset with 415 in the error shape', async () => {
    const app = createApp({ db: okDb(), logger: createLogger({ destination: capture().destination }) });
    const response = await request(app)
      .post('/anything')
      .set('Content-Type', 'application/json; charset=klingon')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send('{"a":1}');
    expect(response.status).toBe(HTTP_UNSUPPORTED_MEDIA_TYPE);
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });
});

describe('readiness log context', () => {
  it('logs a failed readiness check with the response request id', async () => {
    const { destination, lines } = capture();
    const db = {
      query: async (_sql: string): Promise<unknown> => {
        throw new Error('down');
      },
    };
    const response = await request(createApp({ db, logger: createLogger({ destination }) })).get('/health/ready');
    await flush();
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    const failure = lines.map((line) => JSON.parse(line)).find((entry) => entry.msg === 'readiness check failed');
    expect(failure?.requestId).toBe(response.headers['x-request-id']);
  });
});

describe('request log path', () => {
  it('logs the route template, never a path parameter value', async () => {
    const code = token();
    const { destination, lines } = capture();
    const app = createApp({
      db: okDb(),
      extraRoutes: (router: Router) => {
        router.get('/verify/:code', (_req, res) => {
          res.status(HTTP_OK).json({ ok: true });
        });
      },
      logger: createLogger({ destination }),
    });
    await request(app).get(`/verify/${code}`);
    await flush();
    const all = lines.join('\n');
    expect(all).not.toContain(code);
    expect(all).toContain('/verify/:code');
  });
});

describe('secret strength', () => {
  it.each([
    ['RATE_LIMIT_KEY_SECRET', 'one character', 'x'],
    ['RATE_LIMIT_KEY_SECRET', 'one short of 32', 'x'.repeat(SECRET_MIN_LENGTH - 1)],
    ['RATE_LIMIT_KEY_SECRET', '32 spaces', ' '.repeat(SECRET_MIN_LENGTH)],
    ['REVENUECAT_WEBHOOK_AUTH', '32 spaces', ' '.repeat(SECRET_MIN_LENGTH)],
    ['REVENUECAT_WEBHOOK_AUTH', '31 characters plus a space', `${'x'.repeat(SECRET_MIN_LENGTH - 1)} `],
  ])('rejects %s set to %s', (name, _label, value) => {
    expect(() => loadEnv({ ...validEnv(), [name]: value })).toThrow(name);
  });

  it('never echoes a rejected secret', () => {
    const value = ` ${secret().slice(0, SECRET_MIN_LENGTH - 2)} `;
    let message = '';
    try {
      loadEnv({ ...validEnv(), RATE_LIMIT_KEY_SECRET: value });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('RATE_LIMIT_KEY_SECRET');
    expect(message).not.toContain(value.trim());
  });
});
