// IAN-635: setAdminAccess takes FOR UPDATE on the users row, which conflicts with the FOR KEY SHARE
// recordPurchaseEvent takes on it. A PUT therefore waits for an in-flight webhook transaction and
// then sees its committed result: a granted 'revenuecat' row is left unchanged.
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { setAdminAccess } from '../../services/setAdminAccess.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const WAIT_MS = 400;
const PRODUCT = 'syntactical.python.medium';

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

  it('waits for the webhook transaction to commit, then leaves its granted revenuecat row unchanged', async () => {
    const { userId } = await insertSession(database.pool, { createdAt: new Date() });
    const webhook = await database.pool.connect();
    try {
      await webhook.query('BEGIN');
      // The lock recordPurchaseEvent takes, then its entitlement write.
      await webhook.query('SELECT id FROM users WHERE id = $1 FOR KEY SHARE', [userId]);
      await webhook.query(
        "INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, $2, 'revenuecat', 'granted')",
        [userId, PRODUCT],
      );

      let isSettled = false;
      const put = setAdminAccess(database.pool, userId, PRODUCT, true).finally(() => {
        isSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
      expect(isSettled).toBe(false);

      await webhook.query('COMMIT');
      const entry = await put;

      expect(entry).toEqual({ grantSource: 'purchase', isGranted: true, productId: PRODUCT });
      const { rows } = await database.pool.query(
        'SELECT source, status FROM entitlements WHERE user_id = $1 AND product_id = $2',
        [userId, PRODUCT],
      );
      expect(rows).toEqual([{ source: 'revenuecat', status: 'granted' }]);
    } finally {
      await webhook.query('ROLLBACK').catch(() => undefined);
      webhook.release();
    }
  });
});
