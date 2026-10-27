// RevenueCat sends `"expiration_at_ms": null` for a product with no period, rather than leaving the
// key out. A null expiry is read as no expiry: a lifetime purchase grants Pro, a lifetime refund
// (CANCELLATION with cancel_reason CUSTOMER_SUPPORT) revokes it, and an annual grant with a null
// expiry is recorded but grants nothing (fail closed), exactly as when the key is absent.
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
const BASE_TIMESTAMP_MS = 1_790_000_000_000;
const HOUR_MS = 3_600_000;
const ANNUAL = 'syntactical.pro.annual';
const LIFETIME = 'syntactical.pro.lifetime';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>['app'];

interface Target {
  app: TestApp;
  revenueCatAuth: string;
  userId: string;
}

// A lifetime NON_RENEWING_PURCHASE as RevenueCat sends it, with a null expiry, unless overridden.
function buildEvent(userId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app_user_id: userId,
    environment: 'PRODUCTION',
    event_timestamp_ms: BASE_TIMESTAMP_MS,
    expiration_at_ms: null,
    id: randomUUID(),
    product_id: LIFETIME,
    store: 'APP_STORE',
    transaction_id: randomBytes(DISTINCTIVE_BYTES).toString('hex'),
    type: 'NON_RENEWING_PURCHASE',
    ...overrides,
  };
}

async function setup(): Promise<Target> {
  const { app, revenueCatAuth } = createWebhookTestApp({ pool: database.pool });
  const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    `learner-${randomUUID()}@example.com`,
  ]);
  return { app, revenueCatAuth, userId: rows[0].id };
}

function deliver(target: Target, overrides: Record<string, unknown> = {}) {
  return request(target.app)
    .post(ROUTE)
    .set('Authorization', target.revenueCatAuth)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event: buildEvent(target.userId, overrides) }));
}

async function statusOf(userId: string, productId: string): Promise<string | undefined> {
  const { rows } = await database.pool.query<{ status: string }>(
    'SELECT status FROM entitlements WHERE user_id = $1 AND product_id = $2',
    [userId, productId],
  );
  return rows[0]?.status;
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat with a null expiration_at_ms', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('grants the lifetime product on a NON_RENEWING_PURCHASE', async () => {
    const target = await setup();

    const response = await deliver(target);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await statusOf(target.userId, LIFETIME)).toBe('granted');
  });

  it('revokes the lifetime product on a CUSTOMER_SUPPORT cancellation (a refund)', async () => {
    const target = await setup();
    await deliver(target);

    const response = await deliver(target, {
      cancel_reason: 'CUSTOMER_SUPPORT',
      event_timestamp_ms: BASE_TIMESTAMP_MS + HOUR_MS,
      type: 'CANCELLATION',
    });

    expect(response.status).toBe(HTTP_OK);
    expect(await statusOf(target.userId, LIFETIME)).toBe('revoked');
  });

  it('records an annual INITIAL_PURCHASE with a null expiry but grants nothing', async () => {
    const target = await setup();

    const response = await deliver(target, { product_id: ANNUAL, type: 'INITIAL_PURCHASE' });

    expect(response.status).toBe(HTTP_OK);
    expect(await statusOf(target.userId, ANNUAL)).not.toBe('granted');
  });
});
