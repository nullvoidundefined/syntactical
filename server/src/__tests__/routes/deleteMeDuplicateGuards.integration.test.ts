// B-59.6 guards (pass before the duplicate-deletion fix): in the same deterministic interleaving
// (DELETE #1, a code issue for the email, DELETE #2, queued in that order on the email's advisory
// lock), both deletions answer 204 and clear the session cookie, the duplicate never answers 500,
// and the user and every session for the user are gone.
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { COOKIE_NAME, countWhere, runDuplicateDelete } from '../integration/duplicateDeleteFixture.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const HTTP_NO_CONTENT = 204;
const HTTP_ACCEPTED = 202;
const EPOCH_EXPIRY = 'expires=thu, 01 jan 1970 00:00:00 gmt';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function expectClearedCookie(response: request.Response): void {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cleared = header?.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  expect(cleared).toBeDefined();
  const attributes = String(cleared)
    .split(';')
    .map((part) => part.trim().toLowerCase());
  expect(attributes[0]).toBe(`${COOKIE_NAME}=`);
  expect(attributes).toContain(EPOCH_EXPIRY);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me duplicate concurrent deletion, responses', () => {
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
    'answers both deletions 204 with the cookie cleared, never 500, and leaves no user or session',
    async () => {
      const outcome = await runDuplicateDelete(database.pool);

      expect(outcome.codeIssue.status).toBe(HTTP_ACCEPTED);
      expect(outcome.firstDelete.status).toBe(HTTP_NO_CONTENT);
      expect(outcome.secondDelete.status).toBe(HTTP_NO_CONTENT);
      expectClearedCookie(outcome.firstDelete);
      expectClearedCookie(outcome.secondDelete);
      expect(await countWhere(database.pool, 'SELECT count(*) FROM users WHERE id = $1', [outcome.userId])).toBe(0);
      expect(
        await countWhere(database.pool, 'SELECT count(*) FROM sessions WHERE user_id = $1', [outcome.userId]),
      ).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
