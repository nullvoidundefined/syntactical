// B-65: the migration that adds users.password_hash, users.password_updated_at,
// and sessions.auth_method, run with the server's migrate scripts against a real
// Postgres. Each test gets an empty scratch database of its own. Every hash-shaped
// value is built at run time.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';

import { createScratchDatabase } from '../integration/createScratchDatabase.js';
import { runMigrations } from '../integration/runMigrations.js';

const MIGRATION_TIMEOUT_MS = 60_000;
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const SUCCESS = 0;
const SHA256_BYTES = 32;
const SALT_BYTES = 32;
const KEY_BYTES = 64;
const SESSION_TTL_MS = 2_592_000_000;

// The last migration before Stage 7. Everything after it is the password migration
// (and whatever later stages add), so the tests can stop the schema just before it.
const LAST_MIGRATION_BEFORE_PASSWORDS = 1790985600013;
const PASSWORD_MIGRATION_NAME = /^\d+_users-password-and-session-auth-method\.js$/;
const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../../../migrations/', import.meta.url));

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

interface ColumnShape {
  column_default: string | null;
  is_nullable: 'NO' | 'YES';
  udt_name: string;
}

let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIRECTORY)
    .filter((name) => /^\d+_.+\.js$/.test(name))
    .sort();
}

function timestampOf(name: string): number {
  return Number(name.split('_', 1)[0]);
}

// node-pg-migrate's up and down take a count of migrations to run or revert.
function countBeforePasswords(): number {
  return migrationFiles().filter((name) => timestampOf(name) <= LAST_MIGRATION_BEFORE_PASSWORDS).length;
}

function countFromPasswords(): number {
  return migrationFiles().filter((name) => timestampOf(name) > LAST_MIGRATION_BEFORE_PASSWORDS).length;
}

function migrateUp(count?: number): void {
  const { output, status } = runMigrations(scratch.databaseUrl, 'up', count === undefined ? [] : [String(count)]);
  expect(status, output).toBe(SUCCESS);
}

function migrateDownToBeforePasswords(): void {
  // A count of 0 would revert every migration, so there must be one to revert.
  expect(countFromPasswords()).toBeGreaterThan(0);
  const { output, status } = runMigrations(scratch.databaseUrl, 'down', [String(countFromPasswords())]);
  expect(status, output).toBe(SUCCESS);
}

async function columnShape(pool: pg.Pool, table: string, column: string): Promise<ColumnShape | undefined> {
  const { rows } = await pool.query<ColumnShape>(
    `SELECT column_default, is_nullable, udt_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows[0];
}

async function insertUser(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    `learner-${randomUUID()}@example.test`,
  ]);
  const [{ id }] = rows;
  return id;
}

// Inserts a session the way every session before Stage 7 was inserted: no auth_method.
async function insertSessionWithoutMethod(pool: pg.Pool, userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [userId, randomBytes(SHA256_BYTES), new Date(Date.now() + SESSION_TTL_MS)],
  );
  const [{ id }] = rows;
  return id;
}

function insertSessionWithMethod(pool: pg.Pool, userId: string, authMethod: string): Promise<pg.QueryResult> {
  return pool.query(`INSERT INTO sessions (user_id, token_hash, expires_at, auth_method) VALUES ($1, $2, $3, $4)`, [
    userId,
    createHash('sha256').update(randomUUID()).digest(),
    new Date(Date.now() + SESSION_TTL_MS),
    authMethod,
  ]);
}

function unpaddedBase64(bytes: Buffer): string {
  return bytes.toString('base64').replace(/=+$/, '');
}

// A PHC-format scrypt string with a random salt and key, never a real password's hash.
function scryptShapedHash(): string {
  const prefix = ['', 'scrypt', 'v=1', 'ln=17,r=8,p=1'].join('$');
  return `${prefix}$${unpaddedBase64(randomBytes(SALT_BYTES))}$${unpaddedBase64(randomBytes(KEY_BYTES))}`;
}

function setPasswordHash(pool: pg.Pool, userId: string, passwordHash: string | null): Promise<pg.QueryResult> {
  return pool.query('UPDATE users SET password_hash = $2, password_updated_at = now() WHERE id = $1', [
    userId,
    passwordHash,
  ]);
}

describe.skipIf(SKIP_DATABASE_TESTS)('password columns migration', () => {
  beforeEach(async () => {
    scratch = await createScratchDatabase(inject('testDatabaseUrl'));
  });

  afterEach(async () => {
    await scratch.drop();
  });

  it('exists as one migration after the last pre-password migration', () => {
    const passwordMigrations = migrationFiles().filter((name) => PASSWORD_MIGRATION_NAME.test(name));
    expect(passwordMigrations).toHaveLength(1);
    const [passwordMigration] = passwordMigrations;
    expect(timestampOf(passwordMigration)).toBeGreaterThan(LAST_MIGRATION_BEFORE_PASSWORDS);
  });

  it(
    'add the three columns with their types, nullability, and defaults',
    async () => {
      migrateUp();
      const { pool } = scratch;

      expect(await columnShape(pool, 'users', 'password_hash')).toEqual({
        column_default: null,
        is_nullable: 'YES',
        udt_name: 'text',
      });
      expect(await columnShape(pool, 'users', 'password_updated_at')).toEqual({
        column_default: null,
        is_nullable: 'YES',
        udt_name: 'timestamptz',
      });
      const authMethod = await columnShape(pool, 'sessions', 'auth_method');
      expect(authMethod).toMatchObject({ is_nullable: 'NO', udt_name: 'text' });
      expect(authMethod?.column_default).toMatch(/^'code'(::text)?$/);
    },
    MIGRATION_TIMEOUT_MS,
  );

  it(
    'leave an existing user with no password and an existing session with auth_method code',
    async () => {
      migrateUp(countBeforePasswords());
      const { pool } = scratch;
      expect(await columnShape(pool, 'sessions', 'auth_method')).toBeUndefined();
      const userId = await insertUser(pool);
      const sessionId = await insertSessionWithoutMethod(pool, userId);

      migrateUp();

      const { rows: users } = await pool.query('SELECT password_hash, password_updated_at FROM users WHERE id = $1', [
        userId,
      ]);
      expect(users).toEqual([{ password_hash: null, password_updated_at: null }]);
      const { rows: sessions } = await pool.query('SELECT auth_method FROM sessions WHERE id = $1', [sessionId]);
      expect(sessions).toEqual([{ auth_method: 'code' }]);
    },
    MIGRATION_TIMEOUT_MS,
  );

  it(
    'store a null or $scrypt$-prefixed password hash and refuse any other',
    async () => {
      migrateUp();
      const { pool } = scratch;
      const userId = await insertUser(pool);

      await expect(setPasswordHash(pool, userId, null)).resolves.toMatchObject({ rowCount: 1 });
      const scryptHash = scryptShapedHash();
      await expect(setPasswordHash(pool, userId, scryptHash)).resolves.toMatchObject({ rowCount: 1 });
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      expect(rows).toEqual([{ password_hash: scryptHash }]);

      const otherAlgorithm = ['', 'argon2id', 'v=19', unpaddedBase64(randomBytes(SALT_BYTES))].join('$');
      const missingLeadingDollar = scryptShapedHash().slice(1);
      const upperCasePrefix = scryptShapedHash().replace('scrypt', 'SCRYPT');
      const rawHex = randomBytes(KEY_BYTES).toString('hex');
      for (const refused of ['', otherAlgorithm, missingLeadingDollar, upperCasePrefix, rawHex]) {
        await expect(setPasswordHash(pool, userId, refused), JSON.stringify(refused)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }
      const { rows: afterRefusals } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      expect(afterRefusals).toEqual([{ password_hash: scryptHash }]);
    },
    MIGRATION_TIMEOUT_MS,
  );

  it(
    "store a session's auth_method as code by default, accept code and password, and refuse any other",
    async () => {
      migrateUp();
      const { pool } = scratch;
      const userId = await insertUser(pool);

      const defaultSessionId = await insertSessionWithoutMethod(pool, userId);
      const { rows } = await pool.query('SELECT auth_method FROM sessions WHERE id = $1', [defaultSessionId]);
      expect(rows).toEqual([{ auth_method: 'code' }]);

      await expect(insertSessionWithMethod(pool, userId, 'code')).resolves.toMatchObject({ rowCount: 1 });
      await expect(insertSessionWithMethod(pool, userId, 'password')).resolves.toMatchObject({ rowCount: 1 });
      for (const refused of ['oauth', 'Code', 'PASSWORD', '']) {
        await expect(insertSessionWithMethod(pool, userId, refused), JSON.stringify(refused)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }
      await expect(
        pool.query('INSERT INTO sessions (user_id, token_hash, expires_at, auth_method) VALUES ($1, $2, $3, NULL)', [
          userId,
          randomBytes(SHA256_BYTES),
          new Date(Date.now() + SESSION_TTL_MS),
        ]),
      ).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });
    },
    MIGRATION_TIMEOUT_MS,
  );

  it(
    'run up, down, and up again on a database with users and sessions, removing the columns on down',
    async () => {
      migrateUp();
      const { pool } = scratch;
      const codeOnlyUser = await insertUser(pool);
      const codeSessionId = await insertSessionWithoutMethod(pool, codeOnlyUser);
      const passwordUser = await insertUser(pool);
      await setPasswordHash(pool, passwordUser, scryptShapedHash());
      await insertSessionWithMethod(pool, passwordUser, 'password');

      migrateDownToBeforePasswords();

      expect(await columnShape(pool, 'users', 'password_hash')).toBeUndefined();
      expect(await columnShape(pool, 'users', 'password_updated_at')).toBeUndefined();
      expect(await columnShape(pool, 'sessions', 'auth_method')).toBeUndefined();
      const { rows: usersAfterDown } = await pool.query('SELECT id FROM users ORDER BY id');
      expect(usersAfterDown.map(({ id }) => id).sort()).toEqual([codeOnlyUser, passwordUser].sort());
      const { rows: sessionsAfterDown } = await pool.query('SELECT count(*)::int AS count FROM sessions');
      expect(sessionsAfterDown).toEqual([{ count: 2 }]);

      migrateUp();

      const { rows: usersAfterUp } = await pool.query(
        'SELECT password_hash, password_updated_at FROM users WHERE id = ANY($1)',
        [[codeOnlyUser, passwordUser]],
      );
      expect(usersAfterUp).toEqual([
        { password_hash: null, password_updated_at: null },
        { password_hash: null, password_updated_at: null },
      ]);
      const { rows: sessionsAfterUp } = await pool.query('SELECT DISTINCT auth_method FROM sessions');
      expect(sessionsAfterUp).toEqual([{ auth_method: 'code' }]);
      const { rows: codeSession } = await pool.query('SELECT auth_method FROM sessions WHERE id = $1', [codeSessionId]);
      expect(codeSession).toEqual([{ auth_method: 'code' }]);
    },
    MIGRATION_TIMEOUT_MS,
  );
});
