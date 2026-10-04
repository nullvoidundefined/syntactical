// B-59.13 guards: the scrub caps refuse only what is over them. Exactly 1,000 candidate rows (the production row
// cap) still delete with 204 and every candidate is scrubbed; about 4 MiB of candidate payload text (under the 5 MB
// byte cap) does too; rows that are not candidates (another user's rows with no identity and no `%`) never count
// against the row cap; and a candidate set exactly at injected row and byte caps (the byte cap equal to the sum of
// the candidates' payload text lengths) succeeds. These pass before the caps exist and must keep passing after.
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import {
  countWhere,
  createScrubCapApp,
  deleteWithCookie,
  insertOtherUsersRows,
  insertUnlinkedCandidates,
  messagesOf,
  seedAccount,
} from '../integration/deleteMeScrubCapFixture.js';
import type { ScrubCapApp, ScrubCaps, SeededAccount } from '../integration/deleteMeScrubCapFixture.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const HTTP_NO_CONTENT = 204;
const ACCOUNT_DELETED = 'account deleted';
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 90_000;
// The seeded own row plus 999 unlinked rows makes exactly 1,000 candidates.
const AT_ROW_CAP_UNLINKED = 999;
const NON_CANDIDATE_ROWS = 1_500;
const SMALL_PADDING = 16;
// Four rows of 1 MiB padding: about 4.2 million characters, under 5 MB under either reading of MB.
const MIB = 1_048_576;
const UNDER_BYTE_CAP_UNLINKED = 4;
const INJECTED_ROWS = 3;
const INJECTED_PADDING = 10_000;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function seed(caps?: ScrubCaps): Promise<{ account: SeededAccount; testApp: ScrubCapApp }> {
  const testApp = createScrubCapApp(database.pool, caps);
  const account = await seedAccount(database.pool, testApp.clock.now());
  return { account, testApp };
}

async function expectDeletedAndScrubbed(testApp: ScrubCapApp, account: SeededAccount): Promise<void> {
  const response = await deleteWithCookie(testApp.app, account.sessionToken);

  expect(response.status).toBe(HTTP_NO_CONTENT);
  expect(await countWhere(database.pool, 'SELECT count(*) FROM users WHERE id = $1', [account.userId])).toBe(0);
  expect(await countWhere(database.pool, 'SELECT count(*) FROM sessions WHERE user_id = $1', [account.userId])).toBe(0);
  expect(await countWhere(database.pool, 'SELECT count(*) FROM one_time_codes WHERE email = $1', [account.email])).toBe(
    0,
  );
  expect(
    await countWhere(database.pool, 'SELECT count(*) FROM purchase_events WHERE strpos(lower(payload::text), $1) > 0', [
      account.email.toLowerCase(),
    ]),
  ).toBe(0);
  expect(messagesOf(testApp.lines).filter((message) => message === ACCOUNT_DELETED)).toHaveLength(1);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me bounded scrub phase guards', () => {
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
    'deletes with 204 and scrubs every candidate at exactly 1,000 candidate rows',
    async () => {
      const { account, testApp } = await seed();
      await insertUnlinkedCandidates(database.pool, {
        count: AT_ROW_CAP_UNLINKED,
        email: account.email,
        paddingLength: SMALL_PADDING,
      });

      await expectDeletedAndScrubbed(testApp, account);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'deletes with 204 when 1,500 rows of another user carry no identity (not candidates)',
    async () => {
      const { account, testApp } = await seed();
      await insertOtherUsersRows(database.pool, NON_CANDIDATE_ROWS);

      await expectDeletedAndScrubbed(testApp, account);
      expect(
        await countWhere(
          database.pool,
          "SELECT count(*) FROM purchase_events WHERE provider_event_id LIKE 'evt-other-%'",
          [],
        ),
      ).toBe(NON_CANDIDATE_ROWS);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'deletes with 204 and scrubs every candidate with about 4 MiB of candidate payload text',
    async () => {
      const { account, testApp } = await seed();
      await insertUnlinkedCandidates(database.pool, {
        count: UNDER_BYTE_CAP_UNLINKED,
        email: account.email,
        paddingLength: MIB,
      });

      await expectDeletedAndScrubbed(testApp, account);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'deletes with 204 when the candidates sit exactly at injected row and byte caps',
    async () => {
      const testApp = createScrubCapApp(database.pool);
      const account = await seedAccount(database.pool, testApp.clock.now());
      // The own row plus two unlinked rows: three candidates.
      await insertUnlinkedCandidates(database.pool, {
        count: INJECTED_ROWS - 1,
        email: account.email,
        paddingLength: INJECTED_PADDING,
      });
      const { rows } = await database.pool.query<{ total: string }>(
        'SELECT sum(length(payload::text)) AS total FROM purchase_events',
      );
      const [{ total }] = rows;
      const cappedApp = createScrubCapApp(database.pool, {
        deletionScrubMaxBytes: Number(total),
        deletionScrubMaxRows: INJECTED_ROWS,
      });

      await expectDeletedAndScrubbed(cappedApp, account);
    },
    TEST_TIMEOUT_MS,
  );
});
