// Admin access (IAN-601): GET /v1/admin/access lists every paid product with whether the signed-in
// admin has access and where that access comes from ('admin', 'purchase', or null); PUT
// /v1/admin/access { productId, isGranted } grants or revokes an 'admin'-source entitlement for the
// session user only. Purchases win: a 'revenuecat' row is never changed by the PUT, which reports
// grantSource 'purchase'. A request needs a session (401 AUTH_SESSION_REQUIRED) and a user whose
// users.is_admin is true (403 ADMIN_REQUIRED). Every token is built at run time.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import {
  ADMIN_ACCESS_ROUTE,
  getAccess,
  insertEntitlement,
  putAccess,
  readEntitlementRows,
  readIsAdmin,
  signInUser,
} from '../integration/adminAccessRequests.js';
import { ADMIN_TEST_PRODUCTS, createAdminTestApp } from '../integration/createAdminTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const { HARD, MEDIUM } = ADMIN_TEST_PRODUCTS;
const FREE_PRODUCT = 'syntactical.python.easy';
const UNKNOWN_PRODUCT = 'syntactical.cobol.medium';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

interface ProductEntry {
  grantSource: 'admin' | 'purchase' | null;
  isGranted: boolean;
  productId: string;
}

function sortedProducts(response: request.Response): ProductEntry[] {
  const products = (response.body?.data?.products ?? []) as ProductEntry[];
  return [...products].sort((left, right) => left.productId.localeCompare(right.productId));
}

function setup() {
  const testApp = createAdminTestApp({ pool: database.pool });
  return { ...testApp, now: testApp.clock.now() };
}

describe.skipIf(SKIP_DATABASE_TESTS)('/v1/admin/access', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('answers GET and PUT with 401 AUTH_SESSION_REQUIRED without a session or with an expired one', async () => {
    const { app, now } = setup();
    const expired = await insertSession(database.pool, {
      createdAt: new Date(now.getTime() - 31 * DAY_MS),
      expiresAt: new Date(now.getTime() - DAY_MS),
      lastUsedAt: new Date(now.getTime() - DAY_MS),
    });
    await database.pool.query('UPDATE users SET is_admin = true WHERE id = $1', [expired.userId]);

    const responses = [
      await request(app).get(ADMIN_ACCESS_ROUTE),
      await request(app).put(ADMIN_ACCESS_ROUTE).send({ isGranted: true, productId: MEDIUM }),
      await request(app).get(ADMIN_ACCESS_ROUTE).set('Authorization', `Bearer ${expired.sessionToken}`),
      await request(app)
        .put(ADMIN_ACCESS_ROUTE)
        .set('Authorization', `Bearer ${expired.sessionToken}`)
        .send({ isGranted: true, productId: MEDIUM }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(response.body.error.code).toBe('AUTH_SESSION_REQUIRED');
    }
    expect(await readEntitlementRows(database.pool, expired.userId)).toEqual([]);
  });

  it('answers a signed-in non-admin with 403 ADMIN_REQUIRED on GET and PUT and writes nothing', async () => {
    const { app, now } = setup();
    const learner = await signInUser(database.pool, now, false);

    const listed = await getAccess(app, learner);
    const granted = await putAccess(app, learner, { isGranted: true, productId: MEDIUM });

    for (const response of [listed, granted]) {
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.body.error.code).toBe('ADMIN_REQUIRED');
      expect(response.body.data).toBeUndefined();
    }
    expect(await readEntitlementRows(database.pool, learner.userId)).toEqual([]);
    expect(await readIsAdmin(database.pool, learner.userId)).toBe(false);
  });

  it('lists every paid product exactly once for an admin with no entitlements, none granted', async () => {
    const { app, now, paidProductIds } = setup();
    const admin = await signInUser(database.pool, now, true);

    const response = await getAccess(app, admin);

    expect(response.status).toBe(HTTP_OK);
    const products = sortedProducts(response);
    expect(products.map(({ productId }) => productId)).toEqual([...paidProductIds].sort());
    expect(products).toEqual([
      { grantSource: null, isGranted: false, productId: HARD },
      { grantSource: null, isGranted: false, productId: MEDIUM },
    ]);
  });

  it("reports an admin grant as 'admin', a purchase as 'purchase', and a revoked row as not granted", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const other = await signInUser(database.pool, now, false);
    await insertEntitlement(database.pool, {
      productId: MEDIUM,
      source: 'admin',
      status: 'granted',
      userId: admin.userId,
    });
    await insertEntitlement(database.pool, {
      productId: HARD,
      source: 'revenuecat',
      status: 'granted',
      userId: admin.userId,
    });
    await insertEntitlement(database.pool, {
      productId: HARD,
      source: 'admin',
      status: 'granted',
      userId: other.userId,
    });

    const mixed = await getAccess(app, admin);
    await database.pool.query("UPDATE entitlements SET status = 'revoked' WHERE user_id = $1", [admin.userId]);
    const revoked = await getAccess(app, admin);

    expect(mixed.status).toBe(HTTP_OK);
    expect(sortedProducts(mixed)).toEqual([
      { grantSource: 'purchase', isGranted: true, productId: HARD },
      { grantSource: 'admin', isGranted: true, productId: MEDIUM },
    ]);
    expect(revoked.status).toBe(HTTP_OK);
    expect(sortedProducts(revoked)).toEqual([
      { grantSource: null, isGranted: false, productId: HARD },
      { grantSource: null, isGranted: false, productId: MEDIUM },
    ]);
  });

  it("PUT isGranted true creates a granted 'admin' row for the session user and returns the entry", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const response = await putAccess(app, admin, { isGranted: true, productId: MEDIUM });
    const listed = await getAccess(app, admin);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ data: { grantSource: 'admin', isGranted: true, productId: MEDIUM } });
    const rows = await readEntitlementRows(database.pool, admin.userId);
    expect(rows.map(({ product_id, source, status }) => ({ product_id, source, status }))).toEqual([
      { product_id: MEDIUM, source: 'admin', status: 'granted' },
    ]);
    expect(sortedProducts(listed)).toEqual([
      { grantSource: null, isGranted: false, productId: HARD },
      { grantSource: 'admin', isGranted: true, productId: MEDIUM },
    ]);
  });

  it("PUT isGranted false revokes the admin's 'admin' row, and true again re-grants the same row", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    await putAccess(app, admin, { isGranted: true, productId: MEDIUM });

    const revoked = await putAccess(app, admin, { isGranted: false, productId: MEDIUM });
    const afterRevoke = await readEntitlementRows(database.pool, admin.userId);
    const regranted = await putAccess(app, admin, { isGranted: true, productId: MEDIUM });
    const afterRegrant = await readEntitlementRows(database.pool, admin.userId);

    expect(revoked.status).toBe(HTTP_OK);
    expect(revoked.body).toEqual({ data: { grantSource: null, isGranted: false, productId: MEDIUM } });
    expect(afterRevoke.filter(({ status }) => status === 'granted')).toEqual([]);
    expect(regranted.status).toBe(HTTP_OK);
    expect(regranted.body).toEqual({ data: { grantSource: 'admin', isGranted: true, productId: MEDIUM } });
    expect(afterRegrant.map(({ product_id, source, status }) => ({ product_id, source, status }))).toEqual([
      { product_id: MEDIUM, source: 'admin', status: 'granted' },
    ]);
  });

  it('PUT isGranted false with no row for the product answers not granted and grants nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const response = await putAccess(app, admin, { isGranted: false, productId: HARD });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ data: { grantSource: null, isGranted: false, productId: HARD } });
    const rows = await readEntitlementRows(database.pool, admin.userId);
    expect(rows.filter(({ status }) => status === 'granted')).toEqual([]);
  });

  it("PUT never changes a granted 'revenuecat' row, on or off, and reports grantSource 'purchase'", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    await insertEntitlement(database.pool, {
      productId: HARD,
      source: 'revenuecat',
      status: 'granted',
      userId: admin.userId,
    });
    const before = await readEntitlementRows(database.pool, admin.userId);

    const turnedOn = await putAccess(app, admin, { isGranted: true, productId: HARD });
    const turnedOff = await putAccess(app, admin, { isGranted: false, productId: HARD });
    const after = await readEntitlementRows(database.pool, admin.userId);
    const listed = await getAccess(app, admin);

    for (const response of [turnedOn, turnedOff]) {
      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toEqual({ data: { grantSource: 'purchase', isGranted: true, productId: HARD } });
    }
    expect(after).toEqual(before);
    expect(after.map(({ source, status }) => ({ source, status }))).toEqual([
      { source: 'revenuecat', status: 'granted' },
    ]);
    expect(sortedProducts(listed)).toContainEqual({ grantSource: 'purchase', isGranted: true, productId: HARD });
  });

  it('PUT refuses a free, unknown, or empty productId with 400 INPUT_INVALID_BODY and writes nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    for (const productId of [FREE_PRODUCT, UNKNOWN_PRODUCT, '', `${MEDIUM} `, MEDIUM.toUpperCase()]) {
      const response = await putAccess(app, admin, { isGranted: true, productId });
      expect({ productId, status: response.status }).toEqual({ productId, status: HTTP_BAD_REQUEST });
      expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
    }
    const control = await putAccess(app, admin, { isGranted: true, productId: HARD });

    expect(control.status).toBe(HTTP_OK);
    const rows = await readEntitlementRows(database.pool, admin.userId);
    expect(rows.map(({ product_id }) => product_id)).toEqual([HARD]);
  });

  it("PUT changes only the session user's rows, never another user's", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const otherAdmin = await signInUser(database.pool, now, true);
    await insertEntitlement(database.pool, {
      productId: MEDIUM,
      source: 'admin',
      status: 'granted',
      userId: otherAdmin.userId,
    });
    const otherBefore = await readEntitlementRows(database.pool, otherAdmin.userId);

    const granted = await putAccess(app, admin, { isGranted: true, productId: HARD });
    const revoked = await putAccess(app, admin, { isGranted: false, productId: MEDIUM });

    expect(granted.status).toBe(HTTP_OK);
    expect(revoked.status).toBe(HTTP_OK);
    expect(await readEntitlementRows(database.pool, otherAdmin.userId)).toEqual(otherBefore);
    const own = await readEntitlementRows(database.pool, admin.userId);
    expect(own.filter(({ status }) => status === 'granted').map(({ product_id }) => product_id)).toEqual([HARD]);
  });
});
