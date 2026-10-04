// B-62f: a child derived from the request logger keeps the request id; absolute
// URLs come from PUBLIC_BASE_URL, and X-Forwarded-Proto cannot flip req.protocol.
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

function secret(): string {
  return randomBytes(TOKEN_BYTES * 2).toString('hex');
}

function envWith(publicBaseUrl: string | undefined): NodeJS.ProcessEnv {
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

describe('child loggers', () => {
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
