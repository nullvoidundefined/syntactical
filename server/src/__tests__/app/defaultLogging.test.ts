// B-62c: the readiness check logs a database failure by code only, and an app
// built without an injected logger still redacts. Values are built at run time.
import { randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import { createLogger } from '../../clients/logger.js';

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOKEN_BYTES = 8;

function runTimeEmail(): string {
  return `${randomBytes(TOKEN_BYTES).toString('hex')}@example.test`;
}

function captureLines() {
  const lines: string[] = [];
  return { destination: { write: (chunk: string) => lines.push(chunk) }, lines };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('default logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a failed readiness check by pg code without its message or detail', async () => {
    const email = runTimeEmail();
    const failure = Object.assign(new Error(`connection for ${email} refused`), {
      code: '28P01',
      detail: `role for ${email} rejected`,
    });
    const db = {
      query: async (_sql: string): Promise<unknown> => {
        throw failure;
      },
    };
    const { destination, lines } = captureLines();
    const response = await request(createApp({ db, logger: createLogger({ destination }) })).get(
      '/health/ready',
    );
    await flush();

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    const all = lines.join('');
    expect(all).not.toContain(email);
    expect(all).not.toContain('refused');
    expect(all).not.toContain('rejected');
    expect(lines.some((line) => line.includes('28P01'))).toBe(true);
  });

  it('redacts sensitive fields when the app is built without an injected logger', async () => {
    const email = runTimeEmail();
    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
    const db = { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) };
    const app = createApp({
      db,
      extraRoutes: (router) => {
        router.get('/probe', (_req, res) => {
          res.locals.logger.info({ user: { email } }, 'probe');
          res.status(HTTP_OK).json({ ok: true });
        });
      },
    });
    const response = await request(app).get('/probe');
    await flush();

    expect(response.status).toBe(HTTP_OK);
    expect(written.join('')).not.toContain(email);
    expect(written.some((line) => line.includes('probe'))).toBe(true);
  });
});
