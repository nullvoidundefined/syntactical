// Sandbox events: TestFlight and Play license-test purchases cost nothing, so on a server that does
// not accept sandbox (production: REVENUECAT_ACCEPT_SANDBOX unset) a SANDBOX event is recorded and
// answered 200 recorded but changes no entitlement, then or when a later event recomputes the row,
// and one warning names the event type and the reason, never the user. A server that accepts
// sandbox (staging) applies it. An event from any other environment, or with none (the app's
// fixture store sends none), is applied either way.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const SETUP_TIMEOUT_MS = 120_000;
const DISTINCTIVE_BYTES = 12;
const T0 = 1_790_000_000_000;
const HOUR_MS = 3_600_000;
const PINO_WARN_LEVEL = 40;
const LIFETIME = 'syntactical.pro.lifetime';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>;

async function insertUser(): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    `learner-${randomUUID()}@example.com`,
  ]);
  return rows[0].id;
}

// A lifetime purchase from the App Store with no environment, unless overridden.
function deliver(testApp: TestApp, userId: string, overrides: Record<string, unknown> = {}) {
  const event = {
    app_user_id: userId,
    event_timestamp_ms: T0,
    id: randomUUID(),
    product_id: LIFETIME,
    store: 'APP_STORE',
    transaction_id: randomBytes(DISTINCTIVE_BYTES).toString('hex'),
    type: 'NON_RENEWING_PURCHASE',
    ...overrides,
  };
  return request(testApp.app)
    .post(ROUTE)
    .set('Authorization', testApp.revenueCatAuth)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event }));
}

async function statusOf(userId: string): Promise<string | undefined> {
  const { rows } = await database.pool.query<{ status: string }>(
    'SELECT status FROM entitlements WHERE user_id = $1 AND product_id = $2',
    [userId, LIFETIME],
  );
  return rows[0]?.status;
}

async function countPurchaseEvents(): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM purchase_events');
  return Number(rows[0].count);
}

function flushLogs(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat SANDBOX events', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('records a SANDBOX purchase on a server that does not accept sandbox, grants nothing, and warns once', async () => {
    const testApp = createWebhookTestApp({ acceptSandbox: false, pool: database.pool });
    const userId = await insertUser();

    const response = await deliver(testApp, userId, { environment: 'SANDBOX' });
    await flushLogs();

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await countPurchaseEvents()).toBe(1);
    expect(await statusOf(userId)).toBeUndefined();
    const warnings = testApp.logLines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter(({ reason }) => reason === 'sandbox');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ eventType: 'NON_RENEWING_PURCHASE', level: PINO_WARN_LEVEL });
    expect(testApp.logLines.join('\n')).not.toContain(userId);
  });

  it('never applies a recorded SANDBOX grant when a later production event recomputes the row', async () => {
    const testApp = createWebhookTestApp({ acceptSandbox: false, pool: database.pool });
    const userId = await insertUser();

    await deliver(testApp, userId, { environment: 'SANDBOX', event_timestamp_ms: T0 + HOUR_MS });
    await deliver(testApp, userId, { environment: 'PRODUCTION', type: 'REFUND' });

    expect(await statusOf(userId)).toBe('revoked');
  });

  it.each([
    ['PRODUCTION', { environment: 'PRODUCTION' }],
    ['no environment', {}],
  ])('applies a purchase with %s on a server that does not accept sandbox', async (_label, overrides) => {
    const testApp = createWebhookTestApp({ acceptSandbox: false, pool: database.pool });
    const userId = await insertUser();

    await deliver(testApp, userId, overrides);

    expect(await statusOf(userId)).toBe('granted');
  });

  it('applies a SANDBOX purchase on a server that accepts sandbox, as staging does', async () => {
    const testApp = createWebhookTestApp({ acceptSandbox: true, pool: database.pool });
    const userId = await insertUser();

    await deliver(testApp, userId, { environment: 'SANDBOX' });

    expect(await statusOf(userId)).toBe('granted');
  });
});
