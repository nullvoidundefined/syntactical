// The webhook intake reads the event type before anything else: an event type the server does not
// handle answers 200 ignored and records nothing, even when the event lacks app_user_id or
// product_id, which RevenueCat leaves out of some types. A body with no usable event type, or a
// handled type that misses a field a purchase must carry, is refused with 400 INPUT_INVALID_BODY
// and records nothing.
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const SETUP_TIMEOUT_MS = 120_000;
const TIMESTAMP_MS = 1_790_000_000_000;
// A RevenueCat event type the server does not handle.
const UNHANDLED_TYPE = 'SUBSCRIBER_ALIAS';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function post(body: unknown) {
  const { app, revenueCatAuth } = createWebhookTestApp({ pool: database.pool });
  return request(app)
    .post(ROUTE)
    .set('Authorization', revenueCatAuth)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body));
}

async function countPurchaseEvents(): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM purchase_events');
  return Number(rows[0].count);
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat intake', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it.each([
    ['product_id', { app_user_id: randomUUID(), store: 'APP_STORE' }],
    ['app_user_id, product_id, or store', {}],
  ])('answers an unhandled type without %s with 200 ignored and records nothing', async (_missing, fields) => {
    const response = await post({
      event: { event_timestamp_ms: TIMESTAMP_MS, id: randomUUID(), type: UNHANDLED_TYPE, ...fields },
    });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ data: { status: 'ignored' } });
    expect(await countPurchaseEvents()).toBe(0);
  });

  it.each([
    ['an empty body', {}],
    ['an event with no type', { event: { id: randomUUID() } }],
    ['an empty type', { event: { type: '' } }],
    ['a numeric type', { event: { type: 7 } }],
    ['an event that is not an object', { event: UNHANDLED_TYPE }],
  ])('refuses %s with 400 INPUT_INVALID_BODY and records nothing', async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
    expect(await countPurchaseEvents()).toBe(0);
  });

  it('refuses a handled type without product_id with 400 INPUT_INVALID_BODY and records nothing', async () => {
    const response = await post({
      event: {
        app_user_id: randomUUID(),
        event_timestamp_ms: TIMESTAMP_MS,
        id: randomUUID(),
        store: 'APP_STORE',
        type: 'NON_RENEWING_PURCHASE',
      },
    });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
    expect(await countPurchaseEvents()).toBe(0);
  });
});
