// B-62f: a child derived from the request logger keeps the request id, and
// X-Forwarded-Proto cannot flip req.protocol.
import type { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createLogger } from '../../clients/logger.js';

const HTTP_OK = 200;

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
});
