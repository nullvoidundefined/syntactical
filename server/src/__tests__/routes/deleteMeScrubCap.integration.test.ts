// B-59.13: the purchase scrub phase of DELETE /v1/me is bounded. It reads at most 1,000 candidate rows and 5 MB of
// candidate payload text (the sum of the payload text lengths). Over either cap the deletion rolls back, nothing
// changes (user, sessions, codes, purchase payloads), and the answer is 503 with error code SERVER_BUSY carrying
// the request id like every other error; no `account deleted` line is written, and no line names the account. The
// caps are AUTH.DELETION constants, injectable for tests as the optional createAuthTestApp options
// `deletionScrubMaxRows` and `deletionScrubMaxBytes`. The at-cap and under-cap cases live in
// deleteMeScrubCapGuards.integration.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import {
  countWhere,
  createScrubCapApp,
  deleteWithCookie,
  insertUnlinkedCandidates,
  messagesOf,
  seedAccount,
  snapshot,
} from '../integration/deleteMeScrubCapFixture.js';
import type { ScrubCapApp, ScrubCaps, SeededAccount } from '../integration/deleteMeScrubCapFixture.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const HTTP_SERVICE_UNAVAILABLE = 503;
const SERVER_BUSY = 'SERVER_BUSY';
const ACCOUNT_DELETED = 'account deleted';
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 90_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// The production row cap is 1,000: the seeded own row plus 1,000 unlinked rows makes 1,001 candidates.
const OVER_ROW_CAP_UNLINKED = 1_000;
const SMALL_PADDING = 16;
// The production byte cap is 5 MB: six rows of 1 MiB padding each exceed it under either reading of MB.
const MIB = 1_048_576;
const OVER_BYTE_CAP_UNLINKED = 6;
// Injected caps, far below the defaults.
const INJECTED_MAX_ROWS = 2;
const INJECTED_MAX_BYTES = 20_000;
const INJECTED_LARGE_PADDING = 10_000;
const INJECTED_LARGE_ROWS = 3;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function seed(caps?: ScrubCaps): Promise<{ account: SeededAccount; testApp: ScrubCapApp }> {
  const testApp = createScrubCapApp(database.pool, caps);
  const account = await seedAccount(database.pool, testApp.clock.now());
  return { account, testApp };
}

// The 503 contract: SERVER_BUSY with the request id, nothing changed, no deletion log line, no identity in the logs.
async function expectBusyAndUnchanged(testApp: ScrubCapApp, account: SeededAccount): Promise<void> {
  const before = await snapshot(database.pool);
  expect(before.users).toHaveLength(1);
  expect(before.sessions).toHaveLength(2);
  expect(before.one_time_codes).toHaveLength(1);

  const response = await deleteWithCookie(testApp.app, account.sessionToken);

  expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(UUID_PATTERN);
  expect(response.body).toEqual({
    error: { code: SERVER_BUSY, message: expect.any(String), requestId },
  });
  expect(await snapshot(database.pool)).toEqual(before);
  expect(await countWhere(database.pool, 'SELECT count(*) FROM users WHERE id = $1', [account.userId])).toBe(1);
  expect(messagesOf(testApp.lines)).not.toContain(ACCOUNT_DELETED);
  const folded = testApp.lines.map((line) => line.toLowerCase());
  expect(folded.filter((line) => line.includes(account.email.toLowerCase()))).toEqual([]);
  expect(folded.filter((line) => line.includes(account.userId.toLowerCase()))).toEqual([]);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me bounded scrub phase', () => {
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
    'answers 503 SERVER_BUSY and changes nothing with 1,001 candidate rows (production row cap)',
    async () => {
      const { account, testApp } = await seed();
      await insertUnlinkedCandidates(database.pool, {
        count: OVER_ROW_CAP_UNLINKED,
        email: account.email,
        paddingLength: SMALL_PADDING,
      });

      await expectBusyAndUnchanged(testApp, account);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'answers 503 SERVER_BUSY and changes nothing with about 6 MiB of candidate payload text (production byte cap)',
    async () => {
      const { account, testApp } = await seed();
      await insertUnlinkedCandidates(database.pool, {
        count: OVER_BYTE_CAP_UNLINKED,
        email: account.email,
        paddingLength: MIB,
      });

      await expectBusyAndUnchanged(testApp, account);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'answers 503 SERVER_BUSY and changes nothing over an injected row cap',
    async () => {
      const { account, testApp } = await seed({
        deletionScrubMaxRows: INJECTED_MAX_ROWS,
      });
      // The own row plus two unlinked rows: three candidates against a cap of two.
      await insertUnlinkedCandidates(database.pool, {
        count: INJECTED_MAX_ROWS,
        email: account.email,
        paddingLength: SMALL_PADDING,
      });

      await expectBusyAndUnchanged(testApp, account);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'answers 503 SERVER_BUSY and changes nothing over an injected byte cap',
    async () => {
      const { account, testApp } = await seed({
        deletionScrubMaxBytes: INJECTED_MAX_BYTES,
      });
      // Three rows of 10,000 padding characters: about 30,000 characters of candidate text against a cap of 20,000.
      await insertUnlinkedCandidates(database.pool, {
        count: INJECTED_LARGE_ROWS,
        email: account.email,
        paddingLength: INJECTED_LARGE_PADDING,
      });

      await expectBusyAndUnchanged(testApp, account);
    },
    TEST_TIMEOUT_MS,
  );
});
