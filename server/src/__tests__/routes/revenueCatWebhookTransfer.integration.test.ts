// TRANSFER moves Pro: when a restore on another account takes purchases over, RevenueCat sends a
// TRANSFER naming the old app user ids (transferred_from) and the new ones (transferred_to), with no
// product or app_user_id. The server records it once, reassigns every RevenueCat purchase event of
// the old users to the first transferred_to id that names a user, and recomputes both Pro products
// for all of them: a lifetime bought on user A, then a TRANSFER from A to B, leaves B with Pro and A
// without. The stored payload keeps neither list of ids. A redelivery moves nothing more, a transfer
// to no known user moves nothing, a SANDBOX transfer moves nothing on a server that does not
// accept sandbox, and a TRANSFER without both id lists is refused with 400 and records nothing.
// An event for an old user that arrives after the TRANSFER (a retry, or one that waited on the
// lock) with an event timestamp not later than the transfer follows it, along a chain of transfers,
// to the user that holds the purchase now; one strictly newer stays with the old user.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { hasPro } from '../../services/hasPro.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const SETUP_TIMEOUT_MS = 120_000;
const DISTINCTIVE_BYTES = 12;
const T0 = 1_790_000_000_000;
const HOUR_MS = 3_600_000;
const YEAR_MS = 31_536_000_000;
const ANNUAL = 'syntactical.pro.annual';
const LIFETIME = 'syntactical.pro.lifetime';
// After every event below and long before the annual period ends.
const NOW = new Date(T0 + 3 * HOUR_MS);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>;

interface EntitlementRow {
  expires_at: Date | null;
  product_id: string;
  status: string;
}

async function insertUser(): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    `learner-${randomUUID()}@example.com`,
  ]);
  return rows[0].id;
}

function post(testApp: TestApp, event: Record<string, unknown>) {
  return request(testApp.app)
    .post(ROUTE)
    .set('Authorization', testApp.revenueCatAuth)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event }));
}

// A purchase of `productId` by `userId` at T0; the annual carries a one-year period.
function purchase(userId: string, productId: string): Record<string, unknown> {
  const isAnnual = productId === ANNUAL;
  return {
    app_user_id: userId,
    environment: 'SANDBOX',
    event_timestamp_ms: T0,
    ...(isAnnual ? { expiration_at_ms: T0 + YEAR_MS } : {}),
    id: randomUUID(),
    product_id: productId,
    store: 'APP_STORE',
    transaction_id: randomBytes(DISTINCTIVE_BYTES).toString('hex'),
    type: isAnnual ? 'INITIAL_PURCHASE' : 'NON_RENEWING_PURCHASE',
  };
}

// A RENEWAL of the annual by `userId` stamped `timestampMs`, extending the period to `expiresAtMs`.
function renewal(userId: string, timestampMs: number, expiresAtMs: number): Record<string, unknown> {
  return {
    ...purchase(userId, ANNUAL),
    event_timestamp_ms: timestampMs,
    expiration_at_ms: expiresAtMs,
    type: 'RENEWAL',
  };
}

function transfer(fromIds: unknown, toIds: unknown, timestampMs = T0 + HOUR_MS): Record<string, unknown> {
  return {
    environment: 'SANDBOX',
    event_timestamp_ms: timestampMs,
    id: randomUUID(),
    store: 'APP_STORE',
    transferred_from: fromIds,
    transferred_to: toIds,
    type: 'TRANSFER',
  };
}

async function rowsOf(userId: string): Promise<EntitlementRow[]> {
  const { rows } = await database.pool.query<EntitlementRow>(
    'SELECT product_id, status, expires_at FROM entitlements WHERE user_id = $1 ORDER BY product_id',
    [userId],
  );
  return rows;
}

async function ownerOf(eventId: unknown): Promise<string | null> {
  const { rows } = await database.pool.query<{ user_id: string | null }>(
    'SELECT user_id FROM purchase_events WHERE provider_event_id = $1',
    [eventId],
  );
  expect(rows).toHaveLength(1);
  return rows[0].user_id;
}

async function countPurchaseEvents(): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM purchase_events');
  return Number(rows[0].count);
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat TRANSFER', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('a lifetime bought on user A, then a TRANSFER from A to B, leaves B Pro and A not', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    await post(testApp, purchase(userA, LIFETIME));

    const response = await post(testApp, transfer([userA], [userB]));

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await hasPro(database.pool, userB, NOW)).toBe(true);
    expect(await hasPro(database.pool, userA, NOW)).toBe(false);
    expect(await rowsOf(userB)).toEqual([{ expires_at: null, product_id: LIFETIME, status: 'granted' }]);
    expect(await rowsOf(userA)).toEqual([{ expires_at: null, product_id: LIFETIME, status: 'revoked' }]);
    const { rows } = await database.pool.query<{ payload: Record<string, unknown>; product_id: string | null }>(
      "SELECT payload, product_id FROM purchase_events WHERE kind = 'TRANSFER'",
    );
    expect(rows).toEqual([
      {
        payload: { environment: 'SANDBOX', event_timestamp_ms: T0 + HOUR_MS, store: 'APP_STORE', type: 'TRANSFER' },
        product_id: null,
      },
    ]);
  });

  it('moves an annual grant with its expiry', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    await post(testApp, purchase(userA, ANNUAL));

    await post(testApp, transfer([userA], [userB]));

    expect(await rowsOf(userB)).toEqual([
      { expires_at: new Date(T0 + YEAR_MS), product_id: ANNUAL, status: 'granted' },
    ]);
    expect(await hasPro(database.pool, userA, NOW)).toBe(false);
  });

  it('answers a redelivered TRANSFER duplicate and moves nothing bought since', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    const event = transfer([userA], [userB]);
    await post(testApp, purchase(userA, LIFETIME));
    await post(testApp, event);
    await post(testApp, { ...purchase(userA, ANNUAL), event_timestamp_ms: T0 + 2 * HOUR_MS });

    const redelivered = await post(testApp, event);

    expect(redelivered.body).toEqual({ data: { status: 'duplicate' } });
    expect(await hasPro(database.pool, userA, NOW)).toBe(true);
    expect(await rowsOf(userB)).toEqual([{ expires_at: null, product_id: LIFETIME, status: 'granted' }]);
  });

  it('sends a RENEWAL for A delivered after a TRANSFER from A to B, stamped before it, to B', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    await post(testApp, purchase(userA, ANNUAL));
    await post(testApp, transfer([userA], [userB]));
    const late = renewal(userA, T0 + HOUR_MS / 2, T0 + 2 * YEAR_MS);

    const response = await post(testApp, late);

    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await ownerOf(late.id)).toBe(userB);
    expect(await rowsOf(userB)).toEqual([
      { expires_at: new Date(T0 + 2 * YEAR_MS), product_id: ANNUAL, status: 'granted' },
    ]);
    expect(await hasPro(database.pool, userB, NOW)).toBe(true);
    expect(await hasPro(database.pool, userA, NOW)).toBe(false);
  });

  it('sends an event for A stamped exactly at the TRANSFER to B', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    await post(testApp, purchase(userA, ANNUAL));
    await post(testApp, transfer([userA], [userB]));
    const late = renewal(userA, T0 + HOUR_MS, T0 + 2 * YEAR_MS);

    await post(testApp, late);

    expect(await ownerOf(late.id)).toBe(userB);
    expect(await hasPro(database.pool, userA, NOW)).toBe(false);
  });

  it('keeps with A a purchase by A stamped after the TRANSFER from A to B', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    await post(testApp, purchase(userA, LIFETIME));
    await post(testApp, transfer([userA], [userB]));
    const later: Record<string, unknown> = { ...purchase(userA, ANNUAL), event_timestamp_ms: T0 + 2 * HOUR_MS };

    await post(testApp, later);

    expect(await ownerOf(later.id)).toBe(userA);
    expect(await rowsOf(userA)).toEqual([
      { expires_at: new Date(T0 + YEAR_MS), product_id: ANNUAL, status: 'granted' },
      { expires_at: null, product_id: LIFETIME, status: 'revoked' },
    ]);
    expect(await rowsOf(userB)).toEqual([{ expires_at: null, product_id: LIFETIME, status: 'granted' }]);
  });

  it('sends a late event for A along a chain of TRANSFERs, A to B then B to C, to C', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    const userC = await insertUser();
    await post(testApp, purchase(userA, ANNUAL));
    await post(testApp, transfer([userA], [userB]));
    await post(testApp, transfer([userB], [userC], T0 + 2 * HOUR_MS));
    const late = renewal(userA, T0 + HOUR_MS / 2, T0 + 2 * YEAR_MS);

    await post(testApp, late);

    expect(await ownerOf(late.id)).toBe(userC);
    expect(await rowsOf(userC)).toEqual([
      { expires_at: new Date(T0 + 2 * YEAR_MS), product_id: ANNUAL, status: 'granted' },
    ]);
    expect(await hasPro(database.pool, userA, NOW)).toBe(false);
    expect(await hasPro(database.pool, userB, NOW)).toBe(false);
  });

  it('stops a chain of TRANSFERs that returns to A, and follows a later one away again', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    await post(testApp, purchase(userA, ANNUAL));
    await post(testApp, transfer([userA], [userB]));
    await post(testApp, transfer([userB], [userA], T0 + HOUR_MS));
    const late = renewal(userA, T0 + HOUR_MS / 2, T0 + 2 * YEAR_MS);

    const response = await post(testApp, late);

    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await ownerOf(late.id)).toBe(userA);
    expect(await hasPro(database.pool, userA, NOW)).toBe(true);
    expect(await hasPro(database.pool, userB, NOW)).toBe(false);

    await post(testApp, transfer([userA], [userB], T0 + 2 * HOUR_MS));
    const later = renewal(userA, T0 + HOUR_MS / 2, T0 + 3 * YEAR_MS);
    await post(testApp, later);

    expect(await ownerOf(later.id)).toBe(userB);
    expect(await hasPro(database.pool, userA, NOW)).toBe(false);
  });

  it('answers a redelivered late event duplicate and records it once, under B', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    await post(testApp, purchase(userA, ANNUAL));
    await post(testApp, transfer([userA], [userB]));
    const late = renewal(userA, T0 + HOUR_MS / 2, T0 + 2 * YEAR_MS);
    await post(testApp, late);

    const redelivered = await post(testApp, late);

    expect(redelivered.body).toEqual({ data: { status: 'duplicate' } });
    expect(await ownerOf(late.id)).toBe(userB);
    expect(await countPurchaseEvents()).toBe(3);
    expect(await hasPro(database.pool, userA, NOW)).toBe(false);
    expect(await hasPro(database.pool, userB, NOW)).toBe(true);
  });

  it('records a TRANSFER to no known user and moves nothing', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    await post(testApp, purchase(userA, LIFETIME));

    const response = await post(testApp, transfer([userA], [randomUUID(), '$RCAnonymousID:0123456789abcdef']));

    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await hasPro(database.pool, userA, NOW)).toBe(true);
    const { rows } = await database.pool.query<{ kind: string; user_id: string | null }>(
      'SELECT kind, user_id FROM purchase_events ORDER BY kind',
    );
    expect(rows).toEqual([
      { kind: 'NON_RENEWING_PURCHASE', user_id: userA },
      { kind: 'TRANSFER', user_id: null },
    ]);
  });

  it('moves nothing for a SANDBOX TRANSFER on a server that does not accept sandbox', async () => {
    const testApp = createWebhookTestApp({ acceptSandbox: false, pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();
    await post(testApp, { ...purchase(userA, LIFETIME), environment: 'PRODUCTION' });

    const response = await post(testApp, transfer([userA], [userB]));

    expect(response.body).toEqual({ data: { status: 'recorded' } });
    expect(await hasPro(database.pool, userA, NOW)).toBe(true);
    expect(await hasPro(database.pool, userB, NOW)).toBe(false);
  });

  it('refuses a TRANSFER without both id lists with 400 INPUT_INVALID_BODY and records nothing', async () => {
    const testApp = createWebhookTestApp({ pool: database.pool });
    const userA = await insertUser();
    const userB = await insertUser();

    for (const event of [
      transfer([], [userB]),
      transfer([userA], undefined),
      transfer([userA], userB),
      transfer([userA], [42]),
    ]) {
      const response = await post(testApp, event);
      expect({ event, status: response.status }).toEqual({ event, status: HTTP_BAD_REQUEST });
      expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
    }
    expect(await countPurchaseEvents()).toBe(0);
  });
});
