// IAN-635: setAdminAccess takes FOR UPDATE on the users row, which conflicts with the FOR KEY SHARE
// recordPurchaseEvent takes on it. A PUT therefore waits for an in-flight webhook transaction and
// then applies its write. The test proves the wait from pg_stat_activity (a backend blocked on a
// Lock) of the PUT's own connection, so it fails if lockUserRow is removed. The
// "PUT never changes a granted 'revenuecat' row" case (a committed granted store row) is covered
// in server/src/__tests__/routes/adminAccess.integration.test.ts.
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { setAdminAccess } from '../../services/setAdminAccess.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const SETUP_TIMEOUT_MS = 120_000;
const WAIT_LIMIT_MS = 5_000;
// Above WAIT_LIMIT_MS, so a missing lock fails on the isBlocked assertion, not on a test timeout.
const TEST_TIMEOUT_MS = 15_000;
const POLL_MS = 20;
const PRODUCT = 'syntactical.python.medium';
// Names the PUT's connections so the poll matches no other test's blocked FOR UPDATE.
const PUT_APPLICATION_NAME = 'ian664-set-admin-access';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

describe.skipIf(SKIP_DATABASE_TESTS)('setAdminAccess vs an in-flight webhook transaction', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it(
    'waits on the user-row lock held by a webhook-style transaction, then applies its grant',
    async () => {
      const { userId } = await insertSession(database.pool, { createdAt: new Date() });
      // Committed setup: a refunded purchase, which the upsert's WHERE would allow updating, so only
      // the user-row lock can make the PUT wait.
      await database.pool.query(
        "INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, $2, 'revenuecat', 'revoked')",
        [userId, PRODUCT],
      );
      const webhook = await database.pool.connect();
      const putPool = new pg.Pool({
        application_name: PUT_APPLICATION_NAME,
        connectionString: database.databaseUrl,
        max: 1,
      });
      let isHolding = true;
      try {
        await webhook.query('BEGIN');
        // Exactly the lock recordPurchaseEvent takes; no entitlement row is touched.
        await webhook.query('SELECT id FROM users WHERE id = $1 FOR KEY SHARE', [userId]);

        const put = setAdminAccess(putPool, userId, PRODUCT, true);
        const deadline = Date.now() + WAIT_LIMIT_MS;
        let isBlocked = false;
        while (!isBlocked && Date.now() < deadline) {
          const { rows } = await database.pool.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND application_name = $1 AND wait_event_type = 'Lock' AND query ILIKE '%FROM users%FOR UPDATE%'",
            [PUT_APPLICATION_NAME],
          );
          isBlocked = rows.length > 0;
          if (!isBlocked) {
            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          }
        }
        expect(isBlocked).toBe(true);

        await webhook.query('COMMIT');
        isHolding = false;
        const entry = await put;

        expect(entry).toEqual({ grantSource: 'admin', isGranted: true, productId: PRODUCT });
        const { rows } = await database.pool.query(
          'SELECT source, status FROM entitlements WHERE user_id = $1 AND product_id = $2',
          [userId, PRODUCT],
        );
        expect(rows).toEqual([{ source: 'admin', status: 'granted' }]);
      } finally {
        if (isHolding) {
          await webhook.query('ROLLBACK').catch(() => undefined);
        }
        webhook.release();
        await putPool.end();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
