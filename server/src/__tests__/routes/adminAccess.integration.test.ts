// Admin access as a Pro toggle (spec "2. Pro", Server): GET /v1/admin/access answers one entry in
// today's AdminProductEntry shape, { grantSource, isGranted, productId: 'syntactical.pro.lifetime' }.
// grantSource is 'purchase' when a granted RevenueCat row on either Pro product is active (expires_at
// NULL or later than now), else 'admin' for the admin's own lifetime grant, else null; isGranted is
// true exactly when grantSource is set. PUT /v1/admin/access { isGranted } grants or revokes an
// 'admin'-source lifetime row with no expiry for the session user only and answers the same entry.
// A granted 'revenuecat' row is never overwritten. A request needs a session (401
// AUTH_SESSION_REQUIRED) and users.is_admin (403 ADMIN_REQUIRED). Every token is built at run time.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { hasPro } from '../../services/hasPro.js';
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
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const { ANNUAL, LIFETIME } = ADMIN_TEST_PRODUCTS;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function entry(grantSource: 'admin' | 'purchase' | null) {
  return { data: { grantSource, isGranted: grantSource !== null, productId: LIFETIME } };
}

function setup() {
  const testApp = createAdminTestApp({ pool: database.pool });
  return { ...testApp, now: testApp.clock.now() };
}

function shape(rows: Awaited<ReturnType<typeof readEntitlementRows>>) {
  return rows.map(({ expires_at, product_id, source, status }) => ({ expires_at, product_id, source, status }));
}

describe.skipIf(SKIP_DATABASE_TESTS)('/v1/admin/access as a Pro toggle', () => {
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
      await request(app).put(ADMIN_ACCESS_ROUTE).send({ isGranted: true }),
      await request(app).get(ADMIN_ACCESS_ROUTE).set('Authorization', `Bearer ${expired.sessionToken}`),
      await request(app)
        .put(ADMIN_ACCESS_ROUTE)
        .set('Authorization', `Bearer ${expired.sessionToken}`)
        .send({ isGranted: true }),
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
    const granted = await putAccess(app, learner, { isGranted: true });

    for (const response of [listed, granted]) {
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.body.error.code).toBe('ADMIN_REQUIRED');
      expect(response.body.data).toBeUndefined();
    }
    expect(await readEntitlementRows(database.pool, learner.userId)).toEqual([]);
    expect(await readIsAdmin(database.pool, learner.userId)).toBe(false);
  });

  it('GET answers the lifetime entry, not granted, for an admin with no entitlements', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const response = await getAccess(app, admin);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual(entry(null));
  });

  it("GET reports an admin grant as 'admin', a RevenueCat lifetime grant as 'purchase', and a revoked row as null", async () => {
    const { app, now } = setup();
    const adminGranted = await signInUser(database.pool, now, true);
    const purchased = await signInUser(database.pool, now, true);
    const revoked = await signInUser(database.pool, now, true);
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'admin',
      status: 'granted',
      userId: adminGranted.userId,
    });
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'revenuecat',
      status: 'granted',
      userId: purchased.userId,
    });
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'admin',
      status: 'revoked',
      userId: revoked.userId,
    });

    expect((await getAccess(app, adminGranted)).body).toEqual(entry('admin'));
    expect((await getAccess(app, purchased)).body).toEqual(entry('purchase'));
    expect((await getAccess(app, revoked)).body).toEqual(entry(null));
  });

  it("GET reports an active annual RevenueCat grant as 'purchase', and an expired one as not granted", async () => {
    const { app, now } = setup();
    const active = await signInUser(database.pool, now, true);
    const expired = await signInUser(database.pool, now, true);
    await insertEntitlement(database.pool, {
      expiresAt: new Date(now.getTime() + DAY_MS),
      productId: ANNUAL,
      source: 'revenuecat',
      status: 'granted',
      userId: active.userId,
    });
    await insertEntitlement(database.pool, {
      expiresAt: new Date(now.getTime() - DAY_MS),
      productId: ANNUAL,
      source: 'revenuecat',
      status: 'granted',
      userId: expired.userId,
    });

    const activeResponse = await getAccess(app, active);
    const expiredResponse = await getAccess(app, expired);

    expect(activeResponse.status).toBe(HTTP_OK);
    expect(activeResponse.body).toEqual({
      data: { grantSource: 'purchase', isGranted: true, productId: 'syntactical.pro.lifetime' },
    });
    expect(expiredResponse.status).toBe(HTTP_OK);
    expect(expiredResponse.body).toEqual(entry(null));
  });

  it("GET reports 'purchase' over an admin grant while an annual purchase is active, and 'admin' once it expires", async () => {
    const { app, clock, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'admin',
      status: 'granted',
      userId: admin.userId,
    });
    await insertEntitlement(database.pool, {
      expiresAt: new Date(now.getTime() + DAY_MS),
      productId: ANNUAL,
      source: 'revenuecat',
      status: 'granted',
      userId: admin.userId,
    });

    const whileActive = await getAccess(app, admin);
    clock.advance(2 * DAY_MS);
    const afterExpiry = await getAccess(app, admin);

    expect(whileActive.body).toEqual(entry('purchase'));
    expect(afterExpiry.status).toBe(HTTP_OK);
    expect(afterExpiry.body).toEqual(entry('admin'));
  });

  it("GET ignores a revoked annual row and another user's lifetime grant", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const other = await signInUser(database.pool, now, false);
    await insertEntitlement(database.pool, {
      expiresAt: new Date(now.getTime() + DAY_MS),
      productId: ANNUAL,
      source: 'revenuecat',
      status: 'revoked',
      userId: admin.userId,
    });
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'admin',
      status: 'granted',
      userId: other.userId,
    });

    const response = await getAccess(app, admin);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual(entry(null));
  });

  it("PUT isGranted true creates a granted 'admin' lifetime row with no expiry, and the user has Pro", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const response = await putAccess(app, admin, { isGranted: true });
    const listed = await getAccess(app, admin);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual(entry('admin'));
    expect(listed.body).toEqual(entry('admin'));
    expect(shape(await readEntitlementRows(database.pool, admin.userId))).toEqual([
      { expires_at: null, product_id: LIFETIME, source: 'admin', status: 'granted' },
    ]);
    expect(await hasPro(database.pool, admin.userId, now)).toBe(true);
  });

  it("PUT isGranted false revokes the admin's row, and true again re-grants the same row", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    await putAccess(app, admin, { isGranted: true });

    const revoked = await putAccess(app, admin, { isGranted: false });
    const afterRevoke = await readEntitlementRows(database.pool, admin.userId);
    const hasProAfterRevoke = await hasPro(database.pool, admin.userId, now);
    const regranted = await putAccess(app, admin, { isGranted: true });

    expect(revoked.status).toBe(HTTP_OK);
    expect(revoked.body).toEqual(entry(null));
    expect(afterRevoke.filter(({ status }) => status === 'granted')).toEqual([]);
    expect(hasProAfterRevoke).toBe(false);
    expect(regranted.body).toEqual(entry('admin'));
    expect(shape(await readEntitlementRows(database.pool, admin.userId))).toEqual([
      { expires_at: null, product_id: LIFETIME, source: 'admin', status: 'granted' },
    ]);
  });

  it('PUT isGranted false with no row answers not granted and grants nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const response = await putAccess(app, admin, { isGranted: false });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual(entry(null));
    expect(await readEntitlementRows(database.pool, admin.userId)).toEqual([]);
  });

  it("PUT never changes a granted 'revenuecat' lifetime row, on or off, and reports 'purchase'", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'revenuecat',
      status: 'granted',
      userId: admin.userId,
    });
    const before = await readEntitlementRows(database.pool, admin.userId);

    const turnedOn = await putAccess(app, admin, { isGranted: true });
    const turnedOff = await putAccess(app, admin, { isGranted: false });

    for (const response of [turnedOn, turnedOff]) {
      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toEqual(entry('purchase'));
    }
    expect(await readEntitlementRows(database.pool, admin.userId)).toEqual(before);
  });

  it("PUT re-grants a refunded (revoked 'revenuecat') lifetime row as 'admin' with no expiry", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'revenuecat',
      status: 'revoked',
      userId: admin.userId,
    });

    const response = await putAccess(app, admin, { isGranted: true });

    expect(response.body).toEqual(entry('admin'));
    expect(shape(await readEntitlementRows(database.pool, admin.userId))).toEqual([
      { expires_at: null, product_id: LIFETIME, source: 'admin', status: 'granted' },
    ]);
  });

  it("PUT leaves an active annual row alone, writes only the lifetime row, and answers 'purchase'", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const annualExpiry = new Date(now.getTime() + DAY_MS);
    await insertEntitlement(database.pool, {
      expiresAt: annualExpiry,
      productId: ANNUAL,
      source: 'revenuecat',
      status: 'granted',
      userId: admin.userId,
    });

    const turnedOn = await putAccess(app, admin, { isGranted: true });
    const turnedOff = await putAccess(app, admin, { isGranted: false });

    for (const response of [turnedOn, turnedOff]) {
      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toEqual(entry('purchase'));
    }
    expect(shape(await readEntitlementRows(database.pool, admin.userId))).toEqual([
      { expires_at: annualExpiry, product_id: ANNUAL, source: 'revenuecat', status: 'granted' },
      { expires_at: null, product_id: LIFETIME, source: 'admin', status: 'revoked' },
    ]);
  });

  it('PUT refuses a productId field or a missing or non-boolean isGranted with 400 and writes nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    for (const body of [
      { isGranted: true, productId: LIFETIME },
      { isGranted: true, productId: 'syntactical.python.medium' },
      {},
      { isGranted: 'true' },
      { isGranted: null },
    ]) {
      const response = await putAccess(app, admin, body);
      expect({ body, status: response.status }).toEqual({ body, status: HTTP_BAD_REQUEST });
      expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
    }
    expect(await readEntitlementRows(database.pool, admin.userId)).toEqual([]);
  });

  it("PUT changes only the session user's rows, never another user's", async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const otherAdmin = await signInUser(database.pool, now, true);
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'admin',
      status: 'granted',
      userId: otherAdmin.userId,
    });
    const otherBefore = await readEntitlementRows(database.pool, otherAdmin.userId);

    const granted = await putAccess(app, admin, { isGranted: true });
    const revoked = await putAccess(app, admin, { isGranted: false });

    expect(granted.status).toBe(HTTP_OK);
    expect(revoked.status).toBe(HTTP_OK);
    expect(await readEntitlementRows(database.pool, otherAdmin.userId)).toEqual(otherBefore);
  });
});
