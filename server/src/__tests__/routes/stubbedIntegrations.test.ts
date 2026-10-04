// Stub mode at the app boundary: the webhook answers 503 and records nothing, the stub email client
// sends nothing and logs no address or code, and /health/ready lists the stubs by name.
import { randomBytes } from 'node:crypto';

import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import { createLogger } from '../../clients/logger.js';
import { createStubEmailClient } from '../../clients/stubEmailClient.js';

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const STUB_LOG_LINE = 'email not sent: email provider not configured';

function createCapturedLogger() {
  const lines: string[] = [];
  const logger = createLogger({
    destination: {
      write(chunk: string) {
        lines.push(...chunk.split('\n').filter((line) => line.length > 0));
      },
    },
  });
  return { lines, logger };
}

function createWatchedDatabase() {
  return {
    query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown> => ({ rows: [{ ready: 1 }] })),
  };
}

describe('webhook with no credential configured', () => {
  async function callWebhook(headers: Record<string, string>) {
    const db = createWatchedDatabase();
    const { logger } = createCapturedLogger();
    const app = createApp({ db, logger, webhooksDisabled: true });
    const response = await request(app)
      .post('/v1/webhooks/revenuecat')
      .set(headers)
      .send({ event: { id: randomBytes(4).toString('hex'), type: 'INITIAL_PURCHASE' } });
    return { db, response };
  }

  it('answers 503 to an unauthenticated request and touches no database', async () => {
    const { db, response } = await callWebhook({});

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(response.body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('answers 503 even to a request that sends an Authorization header', async () => {
    const { db, response } = await callWebhook({ Authorization: randomBytes(24).toString('hex') });

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('answers 503 for every method and path under the webhook prefix', async () => {
    const app = createApp({
      db: createWatchedDatabase(),
      logger: createCapturedLogger().logger,
      webhooksDisabled: true,
    });

    const paths = ['/v1/webhooks', '/v1/webhooks/', '/v1/webhooks/revenuecat/', '/V1/WEBHOOKS/REVENUECAT'];
    for (const path of paths) {
      expect((await request(app).get(path)).status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect((await request(app).post(path).send('not json').set('Content-Type', 'text/plain')).status).toBe(
        HTTP_SERVICE_UNAVAILABLE,
      );
    }
  });
});

describe('stub email client', () => {
  it('sends nothing and logs one fixed line with no address, code, or body', async () => {
    const { lines, logger } = createCapturedLogger();
    const address = `${randomBytes(6).toString('hex')}@example.test`;
    const code = String(Math.floor(100_000 + Math.random() * 900_000));

    await createStubEmailClient(logger).sendSignInCode(address, code);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '').msg).toBe(STUB_LOG_LINE);
    expect(lines.join('\n')).not.toContain(address);
    expect(lines.join('\n')).not.toContain(code);
  });
});

describe('/health/ready with stubs', () => {
  it('lists the stubbed integrations by name', async () => {
    const app = createApp({
      db: createWatchedDatabase(),
      logger: createCapturedLogger().logger,
      stubbed: ['RESEND_API_KEY', 'REVENUECAT_WEBHOOK_AUTH'],
    });

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({
      database: 'ok',
      status: 'ok',
      stubbed: ['RESEND_API_KEY', 'REVENUECAT_WEBHOOK_AUTH'],
    });
  });

  it('adds no stubbed field when nothing is stubbed', async () => {
    const app = createApp({ db: createWatchedDatabase(), logger: createCapturedLogger().logger });

    const response = await request(app).get('/health/ready');

    expect(response.body).toEqual({ database: 'ok', status: 'ok' });
  });
});
