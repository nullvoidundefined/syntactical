// The plan's createPasswordSession service (Task 7.5 Interfaces, deferred from PR #97's review and
// pinned with Task 7.6): after verifyUserPassword, one short transaction locks the user row,
// re-checks that the stored hash is still the verified one, compare-and-sets the rehash, inserts a
// session with auth_method 'password', and stores a timezone only when the user has none. It
// resolves { sessionToken }, or null when the stored hash changed (or the user is gone), and then
// writes nothing. It never creates a user. Every password is built at run time.
import { createHash, randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createPasswordSession } from '../../services/createPasswordSession.js';
import { hashPassword } from '../../services/passwordHash.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const ABSOLUTE_TTL_MS = 2_592_000_000;
const BASE64URL_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TIMEZONE = 'Europe/London';
const OTHER_TIMEZONE = 'Pacific/Auckland';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function buildPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString('hex');
}

async function insertUser(fields: { passwordHash: string; timezone?: string | null }): Promise<string> {
  const { passwordHash, timezone = null } = fields;
  const { rows } = await database.pool.query<{ id: string }>(
    'INSERT INTO users (email, password_hash, password_updated_at, timezone) VALUES ($1, $2, now(), $3) RETURNING id',
    [`learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`, passwordHash, timezone],
  );
  return rows[0]?.id ?? '';
}

async function readUser(userId: string) {
  const { rows } = await database.pool.query<{ password_hash: string | null; timezone: string | null }>(
    'SELECT password_hash, timezone FROM users WHERE id = $1',
    [userId],
  );
  return rows[0];
}

async function readSessions(userId: string) {
  const { rows } = await database.pool.query<{
    auth_method: string;
    created_at: Date;
    expires_at: Date;
    token_hash: Buffer;
  }>('SELECT auth_method, created_at, expires_at, token_hash FROM sessions WHERE user_id = $1', [userId]);
  return rows;
}

async function countRows(table: 'sessions' | 'users'): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
  return Number(rows[0]?.count);
}

describe.skipIf(SKIP_DATABASE_TESTS)('createPasswordSession', () => {
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
    'resolves { sessionToken } and inserts one password session at `now` whose token hash is the SHA-256 of the token, leaving the hash as it was',
    async () => {
      const verifiedHash = await hashPassword(buildPassword());
      const userId = await insertUser({ passwordHash: verifiedHash });
      const now = new Date(Date.now() - 1_000);

      const result = await createPasswordSession(database.pool, {
        now,
        rehash: undefined,
        timezone: undefined,
        userId,
        verifiedHash,
      });

      expect(result).not.toBeNull();
      const sessionToken = String(result?.sessionToken);
      expect(Object.keys(result ?? {})).toEqual(['sessionToken']);
      expect(sessionToken).toMatch(BASE64URL_TOKEN);
      const sessions = await readSessions(userId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.auth_method).toBe('password');
      expect(sessions[0]?.created_at).toEqual(now);
      expect(sessions[0]?.expires_at).toEqual(new Date(now.getTime() + ABSOLUTE_TTL_MS));
      expect(sessions[0]?.token_hash.equals(createHash('sha256').update(sessionToken).digest())).toBe(true);
      expect((await readUser(userId))?.password_hash).toBe(verifiedHash);
      expect(await countRows('users')).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'writes the rehash when the stored hash is still the verified one',
    async () => {
      const verifiedHash = await hashPassword(buildPassword());
      const rehash = await hashPassword(buildPassword());
      const userId = await insertUser({ passwordHash: verifiedHash });

      const result = await createPasswordSession(database.pool, {
        now: new Date(),
        rehash,
        timezone: undefined,
        userId,
        verifiedHash,
      });

      expect(result?.sessionToken).toMatch(BASE64URL_TOKEN);
      expect((await readUser(userId))?.password_hash).toBe(rehash);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'resolves null when the stored hash is no longer the verified one, inserting no session and keeping the newer hash despite a rehash',
    async () => {
      const verifiedHash = await hashPassword(buildPassword());
      const newerHash = await hashPassword(buildPassword());
      const rehash = await hashPassword(buildPassword());
      const userId = await insertUser({ passwordHash: newerHash });

      const result = await createPasswordSession(database.pool, {
        now: new Date(),
        rehash,
        timezone: TIMEZONE,
        userId,
        verifiedHash,
      });

      expect(result).toBeNull();
      expect(await readSessions(userId)).toEqual([]);
      expect(await readUser(userId)).toEqual({ password_hash: newerHash, timezone: null });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'resolves null for a user that no longer exists, creating neither a user nor a session',
    async () => {
      const verifiedHash = await hashPassword(buildPassword());
      const userId = await insertUser({ passwordHash: verifiedHash });
      await database.pool.query('DELETE FROM users WHERE id = $1', [userId]);

      const result = await createPasswordSession(database.pool, {
        now: new Date(),
        rehash: undefined,
        timezone: TIMEZONE,
        userId,
        verifiedHash,
      });

      expect(result).toBeNull();
      expect(await countRows('users')).toBe(0);
      expect(await countRows('sessions')).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'stores the timezone only when the user has none',
    async () => {
      const verifiedHash = await hashPassword(buildPassword());
      const emptyId = await insertUser({ passwordHash: verifiedHash });
      const zonedId = await insertUser({ passwordHash: verifiedHash, timezone: OTHER_TIMEZONE });

      const results = [
        await createPasswordSession(database.pool, {
          now: new Date(),
          rehash: undefined,
          timezone: TIMEZONE,
          userId: emptyId,
          verifiedHash,
        }),
        await createPasswordSession(database.pool, {
          now: new Date(),
          rehash: undefined,
          timezone: TIMEZONE,
          userId: zonedId,
          verifiedHash,
        }),
      ];

      expect(results.map((result) => result === null)).toEqual([false, false]);
      expect((await readUser(emptyId))?.timezone).toBe(TIMEZONE);
      expect((await readUser(zonedId))?.timezone).toBe(OTHER_TIMEZONE);
    },
    TEST_TIMEOUT_MS,
  );
});
