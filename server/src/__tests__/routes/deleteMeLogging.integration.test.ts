// B-59.3: a successful DELETE /v1/me writes exactly one log line with msg `account deleted`,
// carrying the request id (the X-Request-Id response header) and neither the user id nor the
// email. No line written while handling the request, the request log included, holds the email
// in any casing or the user id. Logs go through the production logger to an in-memory sink.
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

const HTTP_NO_CONTENT = 204;
const SETUP_TIMEOUT_MS = 120_000;
const ACCOUNT_DELETED = 'account deleted';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTITY_KEYS = ['userId', 'user_id', 'email'];

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me deletion log line', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('writes one `account deleted` line with the request id and no user id or email', async () => {
    const testApp = createLoggedDeleteApp(database.pool);
    const account = await seedAccount(database.pool, testApp.clock.now());

    const response = await deleteWithCookie(testApp.app, account.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const requestId = response.headers['x-request-id'];
    expect(requestId).toMatch(UUID_PATTERN);

    const deletedLines = testApp.lines.filter((line) => {
      const entry = JSON.parse(line) as { msg?: unknown };
      return entry.msg === ACCOUNT_DELETED;
    });
    expect(deletedLines).toHaveLength(1);
    const [deletedLine] = deletedLines;
    const entry = JSON.parse(deletedLine) as Record<string, unknown>;
    expect(entry.requestId).toBe(requestId);
    for (const key of IDENTITY_KEYS) {
      expect(entry).not.toHaveProperty(key);
    }
    expect(linesExposing([deletedLine], account)).toEqual([]);

    // Every line from the request, the request log included, is free of the identity.
    expect(parsedLines(testApp.lines).length).toBeGreaterThan(1);
    expect(linesExposing(testApp.lines, account)).toEqual([]);
  });
});
