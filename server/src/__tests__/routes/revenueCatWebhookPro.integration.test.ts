// Pro webhook vocabulary (spec "2. Pro", Server): INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, and
// NON_RENEWING_PURCHASE grant; EXPIRATION and REFUND revoke; CANCELLATION revokes the lifetime
// product but leaves an annual grant in force (auto-renew off, access continues), unless its
// cancel_reason is CUSTOMER_SUPPORT, a store refund, which revokes either product;
// SUBSCRIPTION_EXTENDED never changes the status; any other type answers 200 ignored and records
// nothing. Only the two Pro product ids change an entitlement.
// expiration_at_ms, when sent, is a non-negative safe integer kept in the stored payload, or null for
// a product with no period (revenueCatWebhookNullExpiry); any other value is refused with 400 and
// records nothing. A Google Play id with its base plan
// (syntactical.pro.annual:yearly) is the annual product.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const SETUP_TIMEOUT_MS = 120_000;
const DISTINCTIVE_BYTES = 12;
const BASE_TIMESTAMP_MS = 1_790_000_000_000;
const HOUR_MS = 3_600_000;
const YEAR_MS = 31_536_000_000;
const ANNUAL = 'syntactical.pro.annual';
const LIFETIME = 'syntactical.pro.lifetime';
const UNKNOWN_PRODUCT = 'syntactical.pro.monthly';
// How RevenueCat reports the annual subscription bought on Google Play: `<subscription id>:<base plan id>`.
const PLAY_ANNUAL = 'syntactical.pro.annual:yearly';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>['app'];

interface Target {
  app: TestApp;
  revenueCatAuth: string;
  userId: string;
}

// An annual INITIAL_PURCHASE from the App Store with a one-year period, unless overridden.
function buildEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app_user_id: randomUUID(),
    environment: 'SANDBOX',
    event_timestamp_ms: BASE_TIMESTAMP_MS,
    expiration_at_ms: BASE_TIMESTAMP_MS + YEAR_MS,
    id: randomUUID(),
    product_id: ANNUAL,
    store: 'APP_STORE',
    transaction_id: randomBytes(DISTINCTIVE_BYTES).toString('hex'),
    type: 'INITIAL_PURCHASE',
    ...overrides,
  };
}

// The lifetime product has no period: its events carry no expiration_at_ms.
function lifetime(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { expiration_at_ms: undefined, product_id: LIFETIME, type: 'NON_RENEWING_PURCHASE', ...overrides };
}

async function insertUser(): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    `learner-${randomUUID()}@example.com`,
  ]);
  return rows[0].id;
}

async function setup(): Promise<Target> {
  const { app, revenueCatAuth } = createWebhookTestApp({ pool: database.pool });
  return { app, revenueCatAuth, userId: await insertUser() };
}

function deliver(target: Target, overrides: Record<string, unknown> = {}) {
  return request(target.app)
    .post(ROUTE)
    .set('Authorization', target.revenueCatAuth)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event: buildEvent({ app_user_id: target.userId, ...overrides }) }));
}

// The (user, product) status, or undefined when no row exists. Every row here is RevenueCat's.
async function statusOf(userId: string, productId: string): Promise<string | undefined> {
  const { rows } = await database.pool.query<{ source: string; status: string }>(
    'SELECT status, source FROM entitlements WHERE user_id = $1 AND product_id = $2',
    [userId, productId],
  );
  if (rows[0]) {
    expect(rows[0].source).toBe('revenuecat');
  }
  return rows[0]?.status;
}

async function countPurchaseEvents(): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM purchase_events');
  return Number(rows[0].count);
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat Pro event vocabulary', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  describe('grants', () => {
    it.each(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION'])(
      '%s on the annual product answers 200 recorded and grants only the annual row',
      async (type) => {
        const target = await setup();

        const response = await deliver(target, { type });

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { status: 'recorded' } });
        expect(await statusOf(target.userId, ANNUAL)).toBe('granted');
        expect(await statusOf(target.userId, LIFETIME)).toBeUndefined();
      },
    );

    it('NON_RENEWING_PURCHASE on the lifetime product grants only the lifetime row', async () => {
      const target = await setup();

      const response = await deliver(target, lifetime());

      expect(response.body).toEqual({ data: { status: 'recorded' } });
      expect(await statusOf(target.userId, LIFETIME)).toBe('granted');
      expect(await statusOf(target.userId, ANNUAL)).toBeUndefined();
    });
  });

  describe('revokes', () => {
    it('EXPIRATION after an annual grant revokes it', async () => {
      const target = await setup();

      await deliver(target);
      const response = await deliver(target, {
        event_timestamp_ms: BASE_TIMESTAMP_MS + YEAR_MS,
        type: 'EXPIRATION',
      });

      expect(response.body).toEqual({ data: { status: 'recorded' } });
      expect(await statusOf(target.userId, ANNUAL)).toBe('revoked');
    });

    it.each([
      [ANNUAL, {}],
      [LIFETIME, lifetime()],
    ])('REFUND after a grant revokes %s', async (productId, grant) => {
      const target = await setup();

      await deliver(target, grant);
      const response = await deliver(target, {
        ...grant,
        event_timestamp_ms: BASE_TIMESTAMP_MS + HOUR_MS,
        product_id: productId,
        type: 'REFUND',
      });

      expect(response.body).toEqual({ data: { status: 'recorded' } });
      expect(await statusOf(target.userId, productId)).toBe('revoked');
    });

    it.each([
      [ANNUAL, {}],
      [LIFETIME, lifetime()],
    ])(
      'CANCELLATION with cancel_reason CUSTOMER_SUPPORT (a store refund) after a grant revokes %s',
      async (productId, grant) => {
        const target = await setup();

        await deliver(target, grant);
        const response = await deliver(target, {
          ...grant,
          cancel_reason: 'CUSTOMER_SUPPORT',
          event_timestamp_ms: BASE_TIMESTAMP_MS + HOUR_MS,
          product_id: productId,
          type: 'CANCELLATION',
        });

        expect(response.body).toEqual({ data: { status: 'recorded' } });
        expect(await statusOf(target.userId, productId)).toBe('revoked');
      },
    );
  });

  describe('CANCELLATION', () => {
    it('leaves an annual grant in force: auto-renew is off and access continues', async () => {
      const target = await setup();

      await deliver(target);
      const response = await deliver(target, {
        cancel_reason: 'UNSUBSCRIBE',
        event_timestamp_ms: BASE_TIMESTAMP_MS + HOUR_MS,
        type: 'CANCELLATION',
      });

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toEqual({ data: { status: 'recorded' } });
      expect(await countPurchaseEvents()).toBe(2);
      expect(await statusOf(target.userId, ANNUAL)).toBe('granted');
    });

    it('revokes a lifetime grant, as before Pro', async () => {
      const target = await setup();

      await deliver(target, lifetime());
      const response = await deliver(
        target,
        lifetime({ event_timestamp_ms: BASE_TIMESTAMP_MS + HOUR_MS, type: 'CANCELLATION' }),
      );

      expect(response.body).toEqual({ data: { status: 'recorded' } });
      expect(await statusOf(target.userId, LIFETIME)).toBe('revoked');
    });

    it('on the annual product with no grant recorded, records the event and creates no row', async () => {
      const target = await setup();

      const response = await deliver(target, { type: 'CANCELLATION' });

      expect(response.body).toEqual({ data: { status: 'recorded' } });
      expect(await countPurchaseEvents()).toBe(1);
      expect(await statusOf(target.userId, ANNUAL)).toBeUndefined();
    });
  });

  describe('SUBSCRIPTION_EXTENDED', () => {
    it('keeps an annual grant in force and records the event', async () => {
      const target = await setup();

      await deliver(target);
      const response = await deliver(target, {
        event_timestamp_ms: BASE_TIMESTAMP_MS + HOUR_MS,
        expiration_at_ms: BASE_TIMESTAMP_MS + 2 * YEAR_MS,
        type: 'SUBSCRIPTION_EXTENDED',
      });

      expect(response.body).toEqual({ data: { status: 'recorded' } });
      expect(await countPurchaseEvents()).toBe(2);
      expect(await statusOf(target.userId, ANNUAL)).toBe('granted');
    });

    it('with no grant recorded, records the event and creates no row', async () => {
      const target = await setup();

      const response = await deliver(target, { type: 'SUBSCRIPTION_EXTENDED' });

      expect(response.body).toEqual({ data: { status: 'recorded' } });
      expect(await countPurchaseEvents()).toBe(1);
      expect(await statusOf(target.userId, ANNUAL)).toBeUndefined();
    });
  });

  describe('types the server does not handle', () => {
    // TRANSFER is handled from Task 3.8; BILLING_ISSUE stays ignored (the grace-period gap the
    // runbook records as accepted).
    it.each(['BILLING_ISSUE', 'PRODUCT_CHANGE', 'SUBSCRIPTION_PAUSED', 'SUBSCRIBER_ALIAS', 'TEST'])(
      'answers %s with 200 ignored, records nothing, and leaves an annual grant unchanged',
      async (type) => {
        const target = await setup();

        await deliver(target);
        const response = await deliver(target, { event_timestamp_ms: BASE_TIMESTAMP_MS + HOUR_MS, type });

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { status: 'ignored' } });
        expect(await countPurchaseEvents()).toBe(1);
        expect(await statusOf(target.userId, ANNUAL)).toBe('granted');
      },
    );
  });

  it('records a grant for a product id that is not Pro and grants nothing', async () => {
    const target = await setup();

    const response = await deliver(target, { product_id: UNKNOWN_PRODUCT });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await countPurchaseEvents()).toBe(1);
    const { rows } = await database.pool.query('SELECT 1 FROM entitlements WHERE user_id = $1', [target.userId]);
    expect(rows).toEqual([]);
  });

  it('grants the annual for a Google Play id with its base plan and stores the normalised id', async () => {
    const target = await setup();

    const response = await deliver(target, { product_id: PLAY_ANNUAL, store: 'PLAY_STORE' });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await statusOf(target.userId, ANNUAL)).toBe('granted');
    const { rows: entitlementProducts } = await database.pool.query<{ product_id: string }>(
      'SELECT product_id FROM entitlements WHERE user_id = $1',
      [target.userId],
    );
    expect(entitlementProducts).toEqual([{ product_id: ANNUAL }]);
    const { rows: events } = await database.pool.query<{ payload_product_id: string; product_id: string }>(
      "SELECT product_id, payload->>'product_id' AS payload_product_id FROM purchase_events",
    );
    expect(events).toEqual([{ payload_product_id: PLAY_ANNUAL, product_id: ANNUAL }]);
  });

  describe('expiration_at_ms', () => {
    it('keeps a sent expiration_at_ms in the stored payload', async () => {
      const target = await setup();

      await deliver(target, { expiration_at_ms: BASE_TIMESTAMP_MS + YEAR_MS });

      const { rows } = await database.pool.query<{ payload: Record<string, unknown> }>(
        'SELECT payload FROM purchase_events',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toMatchObject({
        expiration_at_ms: BASE_TIMESTAMP_MS + YEAR_MS,
        product_id: ANNUAL,
        type: 'INITIAL_PURCHASE',
      });
    });

    it.each([
      ['a negative number', -1],
      ['a fraction', 1.5],
      ['a numeric string', String(BASE_TIMESTAMP_MS)],
      ['an integer past Number.MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 2],
    ])('refuses %s with 400 INPUT_INVALID_BODY and records nothing', async (_label, value) => {
      const target = await setup();

      const response = await deliver(target, lifetime({ expiration_at_ms: value }));

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
      expect(await countPurchaseEvents()).toBe(0);
    });
  });
});
