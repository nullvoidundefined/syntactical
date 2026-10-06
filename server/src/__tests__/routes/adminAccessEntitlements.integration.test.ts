// Admin access (IAN-601) end to end: an admin's self-grant through PUT /v1/admin/access opens the
// paid bank route and lists the product in /v1/me entitlements; revoking closes the bank again
// (403 ENTITLEMENT_REQUIRED). Purchases win: a RevenueCat purchase delivered through the webhook
// for a product the admin granted themselves takes the row over (granted, source 'revenuecat'),
// and a later admin toggle off leaves the purchase in force. Every token is built at run time.
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
import {
  ADMIN_TEST_MARKERS,
  ADMIN_TEST_PRODUCTS,
  ADMIN_TEST_ROUTES,
  createAdminTestApp,
} from '../integration/createAdminTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
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

function getBank(app: App, caller: Caller, path: string): Promise<request.Response> {
  return authorize(request(app).get(path), caller)
    .buffer(true)
    .parse((res, callback) => {
      const stream = res as unknown as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
    })
    .then((response) => response);
}

function getMe(app: App, caller: Caller): Promise<request.Response> {
  return authorize(request(app).get(ME_ROUTE), caller).then((response) => response);
}

function errorCodeOf(response: request.Response): unknown {
  return (JSON.parse(String(response.body)) as { error?: { code?: unknown } }).error?.code;
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

describe.skipIf(SKIP_DATABASE_TESTS)('admin access reaches the paid bank route and yields to purchases', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('an admin self-grant serves the bank and lists the entitlement; a revoke answers 403 ENTITLEMENT_REQUIRED again', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const beforeGrant = await getBank(app, admin, ADMIN_TEST_ROUTES.MEDIUM_BANK);
    const granted = await putAccess(app, admin, { isGranted: true, productId: MEDIUM });
    const bankWhileGranted = await getBank(app, admin, ADMIN_TEST_ROUTES.MEDIUM_BANK);
    const otherBankWhileGranted = await getBank(app, admin, ADMIN_TEST_ROUTES.HARD_BANK);
    const meWhileGranted = await getMe(app, admin);
    const revoked = await putAccess(app, admin, { isGranted: false, productId: MEDIUM });
    const bankAfterRevoke = await getBank(app, admin, ADMIN_TEST_ROUTES.MEDIUM_BANK);
    const meAfterRevoke = await getMe(app, admin);

    expect(beforeGrant.status).toBe(HTTP_FORBIDDEN);
    expect(granted.status).toBe(HTTP_OK);
    expect(bankWhileGranted.status).toBe(HTTP_OK);
    expect(String(bankWhileGranted.body)).toContain(ADMIN_TEST_MARKERS.MEDIUM);
    expect(otherBankWhileGranted.status).toBe(HTTP_FORBIDDEN);
    expect(meWhileGranted.status).toBe(HTTP_OK);
    expect(meWhileGranted.body.data.entitlements).toEqual([MEDIUM]);
    expect(revoked.status).toBe(HTTP_OK);
    expect(bankAfterRevoke.status).toBe(HTTP_FORBIDDEN);
    expect(errorCodeOf(bankAfterRevoke)).toBe('ENTITLEMENT_REQUIRED');
    expect(String(bankAfterRevoke.body)).not.toContain(ADMIN_TEST_MARKERS.MEDIUM);
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
    const bankAfterToggle = await getBank(app, admin, ADMIN_TEST_ROUTES.HARD_BANK);
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
    expect(bankAfterToggle.status).toBe(HTTP_OK);
    expect(String(bankAfterToggle.body)).toContain(ADMIN_TEST_MARKERS.HARD);
    expect(meAfterToggle.body.data.entitlements).toEqual([HARD]);
  });
});
