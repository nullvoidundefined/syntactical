// Guards on PUT /v1/admin/access (IAN-601): a cookie request needs the CSRF header; the body is
// JSON only; malformed, oversized, mistyped, and injection-shaped bodies are refused and write
// nothing; a userId or isAdmin field never reaches another user or the admin flag; the admin flag
// is read on every request; and the PUT is rate limited per user at 60 an hour, the 61st answering
// 429 RATE_LIMIT_EXCEEDED and changing nothing. Every token is built at run time.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import {
  ADMIN_ACCESS_ROUTE,
  asCookie,
  authorize,
  getAccess,
  insertEntitlement,
  putAccess,
  readEntitlementRows,
  readIsAdmin,
  signInUser,
} from '../integration/adminAccessRequests.js';
import { ADMIN_TEST_PRODUCTS, createAdminTestApp } from '../integration/createAdminTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_TOO_MANY_REQUESTS = 429;
const SETUP_TIMEOUT_MS = 120_000;
const RATE_LIMIT_TIMEOUT_MS = 60_000;
const HOUR_MS = 3_600_000;
// The chosen limit, written out so the test does not borrow the code's constant.
const PUTS_PER_HOUR = 60;
const OVERSIZED_BYTES = 20_000;
const OVERLONG_PRODUCT_ID_LENGTH = 10_000;
const { HARD, MEDIUM } = ADMIN_TEST_PRODUCTS;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function setup() {
  const testApp = createAdminTestApp({ pool: database.pool });
  return { ...testApp, now: testApp.clock.now() };
}

function grantedProductIds(rows: Awaited<ReturnType<typeof readEntitlementRows>>): string[] {
  return rows.filter(({ status }) => status === 'granted').map(({ product_id }) => product_id);
}

describe.skipIf(SKIP_DATABASE_TESTS)('PUT /v1/admin/access guards', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('refuses a cookie PUT without X-Requested-With with 403 and accepts it with the header', async () => {
    const { app, now } = setup();
    const admin = asCookie(await signInUser(database.pool, now, true));

    const withoutHeader = await authorize(request(app).put(ADMIN_ACCESS_ROUTE), admin, false).send({
      isGranted: true,
      productId: MEDIUM,
    });
    const rowsAfterRefusal = await readEntitlementRows(database.pool, admin.userId);
    const withHeader = await putAccess(app, admin, { isGranted: true, productId: MEDIUM });

    expect(withoutHeader.status).toBe(HTTP_FORBIDDEN);
    expect(withoutHeader.body.error.code).toBe('CSRF_HEADER_MISSING');
    expect(rowsAfterRefusal).toEqual([]);
    expect(withHeader.status).toBe(HTTP_OK);
    expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([MEDIUM]);
  });

  it('accepts JSON only: a form or text body is refused with 415 and writes nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const form = await authorize(request(app).put(ADMIN_ACCESS_ROUTE), admin)
      .type('form')
      .send(`productId=${MEDIUM}&isGranted=true`);
    const text = await authorize(request(app).put(ADMIN_ACCESS_ROUTE), admin)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ isGranted: true, productId: MEDIUM }));
    const json = await putAccess(app, admin, { isGranted: true, productId: HARD });

    for (const response of [form, text]) {
      expect(response.status).toBe(HTTP_UNSUPPORTED_MEDIA_TYPE);
      expect(response.body.error.code).toBe('INPUT_UNSUPPORTED_MEDIA_TYPE');
    }
    expect(json.status).toBe(HTTP_OK);
    expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([HARD]);
  });

  it('refuses malformed JSON, an oversized body, and every mistyped or injection-shaped body, writing nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const malformed = await authorize(request(app).put(ADMIN_ACCESS_ROUTE), admin)
      .set('Content-Type', 'application/json')
      .send('{"productId": "syntactical.python.medium", "isGranted": tru');
    const oversized = await putAccess(app, admin, {
      isGranted: true,
      padding: 'x'.repeat(OVERSIZED_BYTES),
      productId: MEDIUM,
    });
    expect(malformed.status).toBe(HTTP_BAD_REQUEST);
    expect(malformed.body.error.code).toBe('INPUT_MALFORMED_JSON');
    expect(oversized.status).toBe(HTTP_PAYLOAD_TOO_LARGE);

    const invalidBodies: unknown[] = [
      {},
      { productId: MEDIUM },
      { isGranted: true },
      { isGranted: 'true', productId: MEDIUM },
      { isGranted: 1, productId: MEDIUM },
      { isGranted: null, productId: MEDIUM },
      { isGranted: true, productId: null },
      { isGranted: true, productId: 42 },
      { isGranted: true, productId: [MEDIUM] },
      { isGranted: true, productId: { $ne: '' } },
      { isGranted: true, productId: `${MEDIUM}' OR '1'='1` },
      { isGranted: true, productId: "'; UPDATE users SET is_admin = true; --" },
      { isGranted: true, productId: 'm'.repeat(OVERLONG_PRODUCT_ID_LENGTH) },
      [{ isGranted: true, productId: MEDIUM }],
    ];
    for (const body of invalidBodies) {
      const response = await putAccess(app, admin, body);
      expect({ body, status: response.status }).toEqual({ body, status: HTTP_BAD_REQUEST });
      expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
    }
    const control = await putAccess(app, admin, { isGranted: true, productId: HARD });

    expect(control.status).toBe(HTTP_OK);
    expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([HARD]);
    const { rows } = await database.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users WHERE is_admin',
    );
    expect(rows).toEqual([{ count: 1 }]);
  });

  it('a userId field never grants to or revokes from another user: refused with 400 or ignored', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const target = await signInUser(database.pool, now, false);
    await insertEntitlement(database.pool, {
      productId: HARD,
      source: 'admin',
      status: 'granted',
      userId: target.userId,
    });
    const targetBefore = await readEntitlementRows(database.pool, target.userId);

    const grantForOther = await putAccess(app, admin, { isGranted: true, productId: MEDIUM, userId: target.userId });
    const revokeForOther = await putAccess(app, admin, { isGranted: false, productId: HARD, userId: target.userId });
    const snakeCase = await putAccess(app, admin, { isGranted: true, productId: MEDIUM, user_id: target.userId });
    const control = await putAccess(app, admin, { isGranted: true, productId: HARD });

    for (const response of [grantForOther, revokeForOther, snakeCase]) {
      expect([HTTP_OK, HTTP_BAD_REQUEST]).toContain(response.status);
    }
    expect(control.status).toBe(HTTP_OK);
    expect(await readEntitlementRows(database.pool, target.userId)).toEqual(targetBefore);
    expect(await readIsAdmin(database.pool, target.userId)).toBe(false);
  });

  it('an isAdmin field never sets the flag, for a non-admin or for another user', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const learner = await signInUser(database.pool, now, false);

    const fromLearner = await putAccess(app, learner, { isAdmin: true, isGranted: true, productId: MEDIUM });
    const fromAdmin = await putAccess(app, admin, {
      isAdmin: true,
      isGranted: true,
      productId: MEDIUM,
      userId: learner.userId,
    });
    const control = await putAccess(app, admin, { isGranted: true, productId: HARD });

    expect(fromLearner.status).toBe(HTTP_FORBIDDEN);
    expect(fromLearner.body.error.code).toBe('ADMIN_REQUIRED');
    expect([HTTP_OK, HTTP_BAD_REQUEST]).toContain(fromAdmin.status);
    expect(control.status).toBe(HTTP_OK);
    expect(await readIsAdmin(database.pool, learner.userId)).toBe(false);
    expect(await readEntitlementRows(database.pool, learner.userId)).toEqual([]);
  });

  it('reads the admin flag on every request: once cleared, the same session gets 403 and changes nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const whileAdmin = await putAccess(app, admin, { isGranted: true, productId: MEDIUM });
    await database.pool.query('UPDATE users SET is_admin = false WHERE id = $1', [admin.userId]);
    const listed = await getAccess(app, admin);
    const revoke = await putAccess(app, admin, { isGranted: false, productId: MEDIUM });

    expect(whileAdmin.status).toBe(HTTP_OK);
    for (const response of [listed, revoke]) {
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.body.error.code).toBe('ADMIN_REQUIRED');
    }
    expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([MEDIUM]);
  });

  it(
    'allows 60 PUTs an hour per user, refuses the 61st with 429 changing nothing, and limits each user separately',
    async () => {
      const { app, clock, now } = setup();
      const admin = await signInUser(database.pool, now, true);
      const otherAdmin = await signInUser(database.pool, now, true);

      for (let index = 0; index < PUTS_PER_HOUR; index += 1) {
        const response = await putAccess(app, admin, { isGranted: index % 2 === 0, productId: MEDIUM });
        expect({ index, status: response.status }).toEqual({ index, status: HTTP_OK });
      }
      // The 60th PUT (index 59) revoked MEDIUM; the 61st would grant it.
      const pastLimit = await putAccess(app, admin, { isGranted: true, productId: MEDIUM });
      const otherUser = await putAccess(app, otherAdmin, { isGranted: true, productId: MEDIUM });

      expect(pastLimit.status).toBe(HTTP_TOO_MANY_REQUESTS);
      expect(pastLimit.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([]);
      expect(otherUser.status).toBe(HTTP_OK);

      clock.advance(HOUR_MS);
      const nextWindow = await putAccess(app, admin, { isGranted: true, productId: MEDIUM });

      expect(nextWindow.status).toBe(HTTP_OK);
      expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([MEDIUM]);
    },
    RATE_LIMIT_TIMEOUT_MS,
  );
});
