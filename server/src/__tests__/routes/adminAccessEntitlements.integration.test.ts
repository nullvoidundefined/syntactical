// Admin access (IAN-601) end to end: an admin's self-grant through PUT /v1/admin/access lists the
// product in /v1/me entitlements, and revoking removes it. Purchases win: a RevenueCat purchase
// delivered through the webhook for a product the admin granted themselves takes the row over
// (granted, source 'revenuecat'), and a later admin toggle off leaves the purchase in force. Every
// token is built at run time.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import {
  authorize,
  getAccess,
  putAccess,
  readEntitlementRows,
  signInUser,
} from '../integration/adminAccessRequests.js';
import type { Caller } from '../integration/adminAccessRequests.js';
import { ADMIN_TEST_PRODUCTS, createAdminTestApp } from '../integration/createAdminTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const HTTP_OK = 200;
const SETUP_TIMEOUT_MS = 120_000;
const WEBHOOK_ROUTE = '/v1/webhooks/revenuecat';
const ME_ROUTE = '/v1/me';
const TRANSACTION_BYTES = 12;
const { HARD, MEDIUM } = ADMIN_TEST_PRODUCTS;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type App = ReturnType<typeof createAdminTestApp>['app'];

function setup() {
  const testApp = createAdminTestApp({ pool: database.pool });
  return { ...testApp, now: testApp.clock.now() };
}

function getMe(app: App, caller: Caller): Promise<request.Response> {
  return authorize(request(app).get(ME_ROUTE), caller).then((response) => response);
}

function deliverPurchase(app: App, revenueCatAuth: string, userId: string, productId: string, at: Date) {
  const event = {
    app_user_id: userId,
    environment: 'SANDBOX',
    event_timestamp_ms: at.getTime(),
    id: randomUUID(),
    product_id: productId,
    purchased_at_ms: at.getTime(),
    store: 'APP_STORE',
    transaction_id: randomBytes(TRANSACTION_BYTES).toString('hex'),
    type: 'NON_RENEWING_PURCHASE',
  };
  return request(app)
    .post(WEBHOOK_ROUTE)
    .set('Authorization', revenueCatAuth)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event }));
}

describe.skipIf(SKIP_DATABASE_TESTS)('admin access grants entitlements and yields to purchases', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('an admin self-grant lists the entitlement in /v1/me; a revoke removes it', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const granted = await putAccess(app, admin, { isGranted: true, productId: MEDIUM });
    const meWhileGranted = await getMe(app, admin);
    const revoked = await putAccess(app, admin, { isGranted: false, productId: MEDIUM });
    const meAfterRevoke = await getMe(app, admin);

    expect(granted.status).toBe(HTTP_OK);
    expect(meWhileGranted.status).toBe(HTTP_OK);
    expect(meWhileGranted.body.data.entitlements).toEqual([MEDIUM]);
    expect(revoked.status).toBe(HTTP_OK);
    expect(meAfterRevoke.body.data.entitlements).toEqual([]);
  });

  it('a RevenueCat purchase takes over an admin-granted row, and a later toggle off leaves the purchase in force', async () => {
    const { app, now, revenueCatAuth } = setup();
    const admin = await signInUser(database.pool, now, true);

    const granted = await putAccess(app, admin, { isGranted: true, productId: HARD });
    const delivered = await deliverPurchase(app, revenueCatAuth, admin.userId, HARD, now);
    const rowsAfterPurchase = await readEntitlementRows(database.pool, admin.userId);
    const listedAfterPurchase = await getAccess(app, admin);
    const toggledOff = await putAccess(app, admin, { isGranted: false, productId: HARD });
    const rowsAfterToggle = await readEntitlementRows(database.pool, admin.userId);
    const meAfterToggle = await getMe(app, admin);

    expect(granted.status).toBe(HTTP_OK);
    expect(delivered.status).toBe(HTTP_OK);
    expect(rowsAfterPurchase.map(({ product_id, source, status }) => ({ product_id, source, status }))).toEqual([
      { product_id: HARD, source: 'revenuecat', status: 'granted' },
    ]);
    expect(listedAfterPurchase.body.data.products).toContainEqual({
      grantSource: 'purchase',
      isGranted: true,
      productId: HARD,
    });
    expect(toggledOff.status).toBe(HTTP_OK);
    expect(toggledOff.body).toEqual({ data: { grantSource: 'purchase', isGranted: true, productId: HARD } });
    expect(rowsAfterToggle).toEqual(rowsAfterPurchase);
    expect(meAfterToggle.body.data.entitlements).toEqual([HARD]);
  });
});
