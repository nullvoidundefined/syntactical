// The test-only webhook (plan "Seams and fixtures"): startServer mounts POST /v1/test/webhook only
// when the caller passes the testWebhook start option, which is refused outside NODE_ENV=test like
// every other test seam. The route takes the RevenueCat webhook body with no Authorization header
// and runs the same intake, so a fixture purchase grants Pro exactly as a store purchase does, while
// the real webhook still answers 401 without its header. Without the option the route does not
// exist (404), even under NODE_ENV=test. The server boots on the repository's content directory.
import { randomBytes, randomUUID } from 'node:crypto';

import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { startServer } from '../../startServer.js';
import type { RunningServer } from '../../startServer.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const SETUP_TIMEOUT_MS = 120_000;
const SECRET_BYTES = 24;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const TEST_ROUTE = '/v1/test/webhook';
const REAL_ROUTE = '/v1/webhooks/revenuecat';
const LIFETIME = 'syntactical.pro.lifetime';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
let running: RunningServer | undefined;
const logger = pino({ level: 'silent' });

function randomSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

function buildSource(nodeEnv: 'development' | 'test'): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'http://localhost:8081',
    DATABASE_URL: database.databaseUrl,
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    NODE_ENV: nodeEnv,
    PORT: '0',
    RATE_LIMIT_KEY_SECRET: randomSecret(),
    RESEND_API_KEY: randomSecret(),
    REVENUECAT_WEBHOOK_AUTH: randomSecret(),
  };
}

async function insertUser(): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    `learner-${randomUUID()}@example.com`,
  ]);
  return rows[0].id;
}

// Shaped like the app's fixture store event (Task 4.13): no environment, so it is applied whatever
// REVENUECAT_ACCEPT_SANDBOX says.
function purchaseEvent(userId: string): Record<string, unknown> {
  return {
    app_user_id: userId,
    event_timestamp_ms: Date.now(),
    id: randomUUID(),
    product_id: LIFETIME,
    store: 'APP_STORE',
    type: 'NON_RENEWING_PURCHASE',
  };
}

function post(path: string, body: unknown): Promise<Response> {
  if (!running) throw new Error('server not started');
  return fetch(`http://127.0.0.1:${running.port}${path}`, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

async function countRows(table: 'entitlements' | 'purchase_events'): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(`SELECT count(*) AS count FROM ${table}`);
  return Number(rows[0].count);
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/test/webhook', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  }, SETUP_TIMEOUT_MS);

  beforeEach(async () => {
    await database.reset();
  });

  afterEach(async () => {
    await running?.close();
    running = undefined;
  });

  it(
    'with the testWebhook option under NODE_ENV=test records an unauthenticated purchase and grants lifetime Pro',
    async () => {
      running = await startServer(buildSource('test'), { logger, testWebhook: true });
      const userId = await insertUser();

      const response = await post(TEST_ROUTE, { event: purchaseEvent(userId) });

      expect(response.status).toBe(HTTP_OK);
      expect(await response.json()).toEqual({ data: { status: 'recorded' } });
      const { rows } = await database.pool.query(
        'SELECT product_id, source, status, expires_at FROM entitlements WHERE user_id = $1',
        [userId],
      );
      expect(rows).toEqual([{ expires_at: null, product_id: LIFETIME, source: 'revenuecat', status: 'granted' }]);
    },
    SETUP_TIMEOUT_MS,
  );

  it(
    'with the option still refuses a body that is not a RevenueCat event, and the real webhook still needs its header',
    async () => {
      running = await startServer(buildSource('test'), { logger, testWebhook: true });
      const userId = await insertUser();

      const invalid = await post(TEST_ROUTE, { event: { type: 'NON_RENEWING_PURCHASE' } });
      const real = await post(REAL_ROUTE, { event: purchaseEvent(userId) });

      expect(invalid.status).toBe(HTTP_BAD_REQUEST);
      expect(real.status).toBe(HTTP_UNAUTHORIZED);
      expect(await countRows('purchase_events')).toBe(0);
    },
    SETUP_TIMEOUT_MS,
  );

  it(
    'under NODE_ENV=test without the option answers 404 and records nothing',
    async () => {
      running = await startServer(buildSource('test'), { logger });
      const userId = await insertUser();

      const response = await post(TEST_ROUTE, { event: purchaseEvent(userId) });

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(await countRows('purchase_events')).toBe(0);
      expect(await countRows('entitlements')).toBe(0);
    },
    SETUP_TIMEOUT_MS,
  );

  it(
    'refuses the option outside NODE_ENV=test before starting',
    async () => {
      let failure: unknown;
      try {
        // Assigned only if the server starts anyway, so afterEach closes it.
        running = await startServer(buildSource('development'), { logger, testWebhook: true });
      } catch (caught) {
        failure = caught;
      }

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe('The test-only webhook is allowed only when NODE_ENV is test');
    },
    SETUP_TIMEOUT_MS,
  );
});
