// B-59.6: the second of two concurrent DELETE /v1/me requests for one user changes nothing and
// writes no log line. Both requests pass requireSession before either commits; the second then
// finds the user gone once it holds the email's advisory lock, so deleteUser resolves false
// without deleting the email's one-time codes, and the route writes `account deleted` only for
// the deletion that happened. deleteUser also resolves false when its `SELECT ... FOR UPDATE` on
// the user row finds no row. Deterministic interleavings, no fixed sleeps.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { withTransaction } from '../../clients/withTransaction.js';
import { deleteUser } from '../../services/deleteUser.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { accountDeletedLines, countWhere, runDuplicateDelete } from '../integration/duplicateDeleteFixture.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const BLOCKED_DEADLINE_MS = 4_000;
const POLL_INTERVAL_MS = 20;
const HEX_BYTES = 6;
const HTTP_ACCEPTED = 202;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me duplicate concurrent deletion', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it(
    'writes one `account deleted` line and keeps a code issued between the two deletions',
    async () => {
      const outcome = await runDuplicateDelete(database.pool);

      expect(outcome.codeIssue.status).toBe(HTTP_ACCEPTED);
      expect(accountDeletedLines(outcome.lines)).toHaveLength(1);
      // The code issued after the first deletion committed is untouched by the second request.
      expect(
        await countWhere(database.pool, 'SELECT count(*) FROM one_time_codes WHERE email = $1', [outcome.email]),
      ).toBe(1);
      expect(await countWhere(database.pool, 'SELECT count(*) FROM users WHERE id = $1', [outcome.userId])).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'deleteUser resolves false when the user row is gone by the time it is locked FOR UPDATE',
    async () => {
      const email = `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
      const { rows } = await database.pool.query<{ id: string }>(
        'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
        [email, 'Europe/London'],
      );
      const [{ id: userId }] = rows;
      const rateLimitKeySecret = randomBytes(HEX_BYTES * 4).toString('hex');

      // A helper deletes the row without committing, so deleteUser still reads it, takes the
      // advisory lock, and then blocks on the row lock until the helper commits the delete.
      const holder = await database.pool.connect();
      let deleting: Promise<boolean> | undefined;
      try {
        const {
          rows: [{ pid: holderPid }],
        } = await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        await holder.query('BEGIN');
        await holder.query('DELETE FROM users WHERE id = $1', [userId]);
        deleting = withTransaction(database.pool, (client) => deleteUser(client, { rateLimitKeySecret, userId }));
        const deadline = Date.now() + BLOCKED_DEADLINE_MS;
        while (
          (await countWhere(database.pool, 'SELECT count(*) FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))', [
            holderPid,
          ])) < 1
        ) {
          if (Date.now() > deadline) {
            throw new Error('timed out waiting for deleteUser to block on the user row');
          }
          await delay(POLL_INTERVAL_MS);
        }
      } finally {
        await holder.query('COMMIT').catch(() => undefined);
        holder.release();
      }

      await expect(deleting).resolves.toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});
