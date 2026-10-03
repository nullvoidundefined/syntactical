// B-59.3 guards (pass before the deletion log line exists): when the deletion transaction rolls
// back, the response is 500, no captured line holds the email in any casing or the user id, and
// no `account deleted` line is written. Logs go through the production logger to an in-memory sink.
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import {
  createLoggedDeleteApp,
  deleteWithCookie,
  linesExposing,
  parsedLines,
  seedAccount,
} from '../integration/deleteMeLogFixture.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const HTTP_INTERNAL_SERVER_ERROR = 500;
const SETUP_TIMEOUT_MS = 120_000;
const HEX_BYTES = 6;
const ACCOUNT_DELETED = 'account deleted';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me deletion log line, rolled-back path', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('logs neither the email nor the user id, and no `account deleted` line, when the delete rolls back', async () => {
    const testApp = createLoggedDeleteApp(database.pool);
    const account = await seedAccount(database.pool, testApp.clock.now());
    const triggerFunction = `refuse_user_delete_${randomBytes(HEX_BYTES).toString('hex')}`;
    await database.pool.query(
      `CREATE FUNCTION ${triggerFunction}() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'user deletion refused by test'; END
       $$ LANGUAGE plpgsql`,
    );
    await database.pool.query(
      `CREATE TRIGGER ${triggerFunction} BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}()`,
    );
    try {
      const response = await deleteWithCookie(testApp.app, account.sessionToken);

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
      const entries = parsedLines(testApp.lines);
      // The request log and the unhandled-error log were both captured.
      expect(entries.length).toBeGreaterThan(1);
      expect(entries.filter((entry) => entry.msg === ACCOUNT_DELETED)).toEqual([]);
      expect(linesExposing(testApp.lines, account)).toEqual([]);
      const { rows } = await database.pool.query('SELECT id FROM users WHERE id = $1', [account.userId]);
      expect(rows).toHaveLength(1);
    } finally {
      await database.pool.query(`DROP TRIGGER IF EXISTS ${triggerFunction} ON users`);
      await database.pool.query(`DROP FUNCTION IF EXISTS ${triggerFunction}()`);
    }
  });
});
