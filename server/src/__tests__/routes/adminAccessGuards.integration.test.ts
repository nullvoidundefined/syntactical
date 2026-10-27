// Guards on PUT /v1/admin/access (spec "2. Pro", Server): a cookie request needs the CSRF header;
// the body is JSON only; malformed, oversized, mistyped, and injection-shaped bodies are refused
// and write nothing; a productId, userId, or isAdmin field is refused and never reaches another
// user or the admin flag; the admin flag is read on every request; and the PUT is rate limited per
// user at 60 an hour, the 61st answering 429 RATE_LIMIT_EXCEEDED and changing nothing. Every token
// is built at run time.
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
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

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
const { LIFETIME } = ADMIN_TEST_PRODUCTS;

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
    });
    const rowsAfterRefusal = await readEntitlementRows(database.pool, admin.userId);
    const withHeader = await putAccess(app, admin, { isGranted: true });

    expect(withoutHeader.status).toBe(HTTP_FORBIDDEN);
    expect(withoutHeader.body.error.code).toBe('CSRF_HEADER_MISSING');
    expect(rowsAfterRefusal).toEqual([]);
    expect(withHeader.status).toBe(HTTP_OK);
    expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([LIFETIME]);
  });

  it('accepts JSON only: a form or text body is refused with 415 and writes nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const form = await authorize(request(app).put(ADMIN_ACCESS_ROUTE), admin).type('form').send('isGranted=true');
    const text = await authorize(request(app).put(ADMIN_ACCESS_ROUTE), admin)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ isGranted: true }));
    const rowsAfterRefusals = await readEntitlementRows(database.pool, admin.userId);
    const json = await putAccess(app, admin, { isGranted: true });

    for (const response of [form, text]) {
      expect(response.status).toBe(HTTP_UNSUPPORTED_MEDIA_TYPE);
      expect(response.body.error.code).toBe('INPUT_UNSUPPORTED_MEDIA_TYPE');
    }
    expect(rowsAfterRefusals).toEqual([]);
    expect(json.status).toBe(HTTP_OK);
  });

  it('refuses malformed JSON, an oversized body, and every mistyped or injection-shaped body, writing nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const malformed = await authorize(request(app).put(ADMIN_ACCESS_ROUTE), admin)
      .set('Content-Type', 'application/json')
      .send('{"isGranted": tru');
    const oversized = await putAccess(app, admin, { isGranted: true, padding: 'x'.repeat(OVERSIZED_BYTES) });
    expect(malformed.status).toBe(HTTP_BAD_REQUEST);
    expect(malformed.body.error.code).toBe('INPUT_MALFORMED_JSON');
    expect(oversized.status).toBe(HTTP_PAYLOAD_TOO_LARGE);

    const invalidBodies: unknown[] = [
      {},
      { isGranted: 'true' },
      { isGranted: 1 },
      { isGranted: null },
      { isGranted: [true] },
      { isGranted: { $ne: false } },
      { isGranted: true, productId: LIFETIME },
      { isGranted: true, productId: "'; UPDATE users SET is_admin = true; --" },
      { isGranted: true, product: LIFETIME },
      [{ isGranted: true }],
    ];
    for (const body of invalidBodies) {
      const response = await putAccess(app, admin, body);
      expect({ body, status: response.status }).toEqual({ body, status: HTTP_BAD_REQUEST });
      expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
    }
    expect(await readEntitlementRows(database.pool, admin.userId)).toEqual([]);
    const control = await putAccess(app, admin, { isGranted: true });

    expect(control.status).toBe(HTTP_OK);
    expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([LIFETIME]);
    const { rows } = await database.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users WHERE is_admin',
    );
    expect(rows).toEqual([{ count: 1 }]);
  });

  it('a userId field never grants to or revokes from another user: refused with 400', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const target = await signInUser(database.pool, now, false);
    await insertEntitlement(database.pool, {
      productId: LIFETIME,
      source: 'admin',
      status: 'granted',
      userId: target.userId,
    });
    const targetBefore = await readEntitlementRows(database.pool, target.userId);

    const grantForOther = await putAccess(app, admin, { isGranted: true, userId: target.userId });
    const revokeForOther = await putAccess(app, admin, { isGranted: false, userId: target.userId });
    const snakeCase = await putAccess(app, admin, { isGranted: false, user_id: target.userId });

    for (const response of [grantForOther, revokeForOther, snakeCase]) {
      expect(response.status).toBe(HTTP_BAD_REQUEST);
    }
    expect(await readEntitlementRows(database.pool, target.userId)).toEqual(targetBefore);
    expect(await readEntitlementRows(database.pool, admin.userId)).toEqual([]);
    expect(await readIsAdmin(database.pool, target.userId)).toBe(false);
  });

  it('an isAdmin field never sets the flag, for a non-admin or for another user', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);
    const learner = await signInUser(database.pool, now, false);

    const fromLearner = await putAccess(app, learner, { isAdmin: true, isGranted: true });
    const fromAdmin = await putAccess(app, admin, { isAdmin: true, isGranted: true, userId: learner.userId });

    expect(fromLearner.status).toBe(HTTP_FORBIDDEN);
    expect(fromLearner.body.error.code).toBe('ADMIN_REQUIRED');
    expect(fromAdmin.status).toBe(HTTP_BAD_REQUEST);
    expect(await readIsAdmin(database.pool, learner.userId)).toBe(false);
    expect(await readEntitlementRows(database.pool, learner.userId)).toEqual([]);
  });

  it('reads the admin flag on every request: once cleared, the same session gets 403 and changes nothing', async () => {
    const { app, now } = setup();
    const admin = await signInUser(database.pool, now, true);

    const whileAdmin = await putAccess(app, admin, { isGranted: true });
    await database.pool.query('UPDATE users SET is_admin = false WHERE id = $1', [admin.userId]);
    const listed = await getAccess(app, admin);
    const revoke = await putAccess(app, admin, { isGranted: false });

    expect(whileAdmin.status).toBe(HTTP_OK);
    for (const response of [listed, revoke]) {
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.body.error.code).toBe('ADMIN_REQUIRED');
    }
    expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([LIFETIME]);
  });

  it(
    'allows 60 PUTs an hour per user, refuses the 61st with 429 changing nothing, and limits each user separately',
    async () => {
      const { app, clock, now } = setup();
      const admin = await signInUser(database.pool, now, true);
      const otherAdmin = await signInUser(database.pool, now, true);

      for (let index = 0; index < PUTS_PER_HOUR; index += 1) {
        const response = await putAccess(app, admin, { isGranted: index % 2 === 0 });
        expect({ index, status: response.status }).toEqual({ index, status: HTTP_OK });
      }
      // The 60th PUT (index 59) revoked; the 61st would grant.
      const pastLimit = await putAccess(app, admin, { isGranted: true });
      const otherUser = await putAccess(app, otherAdmin, { isGranted: true });

      expect(pastLimit.status).toBe(HTTP_TOO_MANY_REQUESTS);
      expect(pastLimit.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([]);
      expect(otherUser.status).toBe(HTTP_OK);

      clock.advance(HOUR_MS);
      const nextWindow = await putAccess(app, admin, { isGranted: true });

      expect(nextWindow.status).toBe(HTTP_OK);
      expect(grantedProductIds(await readEntitlementRows(database.pool, admin.userId))).toEqual([LIFETIME]);
    },
    RATE_LIMIT_TIMEOUT_MS,
  );
});
