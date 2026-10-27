// Pins that the clock createTestApp returns is the one every mounted session-guarded router
// reads (PR #186 review, r1 #1): a session live at the clock's start answers 200 on the admin and
// sync routes, and 401 on both once the clock advances past the idle TTL. The webhook router
// takes no clock, so it has nothing to pin here.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { AUTH } from '../../constants/auth.js';
import { getAccess, signInUser } from './adminAccessRequests.js';
import { createMigratedDatabase } from './createMigratedDatabase.js';
import { createTestApp } from './createTestApp.js';
import { SKIP_DATABASE_TESTS } from './skipDatabaseTests.js';

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const PRODUCT_ID = 'syntactical.python.medium';
const ME_ROUTE = '/v1/me';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

describe.skipIf(SKIP_DATABASE_TESTS)('createTestApp clock', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database.drop();
  });

  it('expires a session on every mounted session-guarded router once the clock advances', async () => {
    const paidProductIds: ReadonlySet<string> = new Set([PRODUCT_ID]);
    const { app, clock } = createTestApp({
      admin: { paidProductIds },
      pool: database.pool,
      sync: { answerKey: new Map() },
    });
    const admin = await signInUser(database.pool, clock.now(), true);
    const getWithBearer = (path: string) =>
      request(app).get(path).set('Authorization', `Bearer ${admin.sessionToken}`).set('Origin', ALLOWED_ORIGIN);
    async function statuses(): Promise<{ admin: number; me: number }> {
      return {
        admin: (await getAccess(app, admin)).status,
        me: (await getWithBearer(ME_ROUTE)).status,
      };
    }

    const live = await statuses();
    clock.advance(AUTH.SESSION.IDLE_TTL_MS + DAY_MS);
    const expired = await statuses();

    expect(live).toEqual({ admin: HTTP_OK, me: HTTP_OK });
    expect(expired).toEqual({ admin: HTTP_UNAUTHORIZED, me: HTTP_UNAUTHORIZED });
  });
});
