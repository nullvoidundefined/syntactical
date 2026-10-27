// The admin Pro toggle end to end (spec "2. Pro", Server): an admin's self-grant through PUT
// /v1/admin/access makes hasPro true with no expiry, and a revoke makes it false again. Purchases
// win: a RevenueCat lifetime purchase delivered through the webhook takes over an admin-granted row
// (granted, source 'revenuecat'), and a later toggle off leaves the purchase in force. An annual
// purchase is a separate row the toggle never touches, and GET reports it as 'purchase' while it is
// active. Every token is built at run time.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { hasPro } from '../../services/hasPro.js';
import { getAccess, putAccess, readEntitlementRows, signInUser } from '../integration/adminAccessRequests.js';
import { ADMIN_TEST_PRODUCTS, createAdminTestApp } from '../integration/createAdminTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const HTTP_OK = 200;
const SETUP_TIMEOUT_MS = 120_000;
const WEBHOOK_ROUTE = '/v1/webhooks/revenuecat';
const TRANSACTION_BYTES = 12;
const YEAR_MS = 31_536_000_000;
const { ANNUAL, LIFETIME } = ADMIN_TEST_PRODUCTS;
// The toggle's entry while a purchase is in force (today's AdminProductEntry shape).
const PURCHASED = { data: { grantSource: 'purchase', isGranted: true, productId: LIFETIME } };

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type App = ReturnType<typeof createAdminTestApp>['app'];

function setup() {
  const testApp = createAdminTestApp({ pool: database.pool });
  return { ...testApp, now: testApp.clock.now() };
}

function deliverPurchase(app: App, revenueCatAuth: string, userId: string, productId: string, at: Date) {
  const isAnnual = productId === ANNUAL;
  const event = {
    app_user_id: userId,
    environment: 'SANDBOX',
    event_timestamp_ms: at.getTime(),
    ...(isAnnual ? { expiration_at_ms: at.getTime() + YEAR_MS } : {}),
    id: randomUUID(),
    product_id: productId,
    purchased_at_ms: at.getTime(),
    store: 'APP_STORE',
    transaction_id: randomBytes(TRANSACTION_BYTES).toString('hex'),
    type: isAnnual ? 'INITIAL_PURCHASE' : 'NON_RENEWING_PURCHASE',
  };
  return request(app)
    .post(WEBHOOK_ROUTE)
    .set('Authorization', revenueCatAuth)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event }));
}

function shape(rows: Awaited<ReturnType<typeof readEntitlementRows>>) {
  return rows.map(({ product_id, source, status }) => ({ product_id, source, status }));
}

describe.skipIf(SKIP_DATABASE_TESTS)('the admin Pro toggle reaches hasPro and yields to purchases', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('a self-grant gives Pro with no expiry, and a revoke takes it away', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const before = await hasPro(database.pool, admin.userId, now);
    const granted = await putAccess(app, admin, { isGranted: true });
    const whileGranted = await hasPro(database.pool, admin.userId, now);
    const farFuture = await hasPro(database.pool, admin.userId, new Date(now.getTime() + 100 * YEAR_MS));
    const revoked = await putAccess(app, admin, { isGranted: false });
    const afterRevoke = await hasPro(database.pool, admin.userId, now);

    expect(before).toBe(false);
    expect(granted.status).toBe(HTTP_OK);
    expect(whileGranted).toBe(true);
    expect(farFuture).toBe(true);
    expect(revoked.status).toBe(HTTP_OK);
    expect(afterRevoke).toBe(false);
  });

  it('a RevenueCat lifetime purchase takes over an admin-granted row, and a later toggle off leaves it in force', async () => {
    const { app, now, revenueCatAuth } = setup();
    const admin = await signInUser(database.pool, now, true);

    const granted = await putAccess(app, admin, { isGranted: true });
    const delivered = await deliverPurchase(app, revenueCatAuth, admin.userId, LIFETIME, now);
    const rowsAfterPurchase = await readEntitlementRows(database.pool, admin.userId);
    const listedAfterPurchase = await getAccess(app, admin);
    const toggledOff = await putAccess(app, admin, { isGranted: false });
    const rowsAfterToggle = await readEntitlementRows(database.pool, admin.userId);

    expect(granted.status).toBe(HTTP_OK);
    expect(delivered.status).toBe(HTTP_OK);
    expect(shape(rowsAfterPurchase)).toEqual([{ product_id: LIFETIME, source: 'revenuecat', status: 'granted' }]);
    expect(listedAfterPurchase.body).toEqual(PURCHASED);
    expect(toggledOff.body).toEqual(PURCHASED);
    expect(rowsAfterToggle).toEqual(rowsAfterPurchase);
    expect(await hasPro(database.pool, admin.userId, now)).toBe(true);
  });

  it('a toggle off with an active annual purchase leaves the annual row and Pro in force', async () => {
    const { app, now, revenueCatAuth } = setup();
    const admin = await signInUser(database.pool, now, true);

    await deliverPurchase(app, revenueCatAuth, admin.userId, ANNUAL, now);
    await putAccess(app, admin, { isGranted: true });
    const toggledOff = await putAccess(app, admin, { isGranted: false });
    const listed = await getAccess(app, admin);

    expect(shape(await readEntitlementRows(database.pool, admin.userId))).toEqual([
      { product_id: ANNUAL, source: 'revenuecat', status: 'granted' },
      { product_id: LIFETIME, source: 'admin', status: 'revoked' },
    ]);
    expect(await hasPro(database.pool, admin.userId, now)).toBe(true);
    for (const response of [toggledOff, listed]) {
      expect(response.body).toEqual(PURCHASED);
    }
  });
});
