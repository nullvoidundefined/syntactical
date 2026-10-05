// Admin access (IAN-601): the migration that adds users.is_admin, a boolean NOT NULL DEFAULT false
// that only the database sets. Run with the server's migrate scripts against a real Postgres; each
// test gets an empty scratch database of its own.
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';

import { createScratchDatabase } from '../integration/createScratchDatabase.js';
import { runMigrations } from '../integration/runMigrations.js';

const MIGRATION_TIMEOUT_MS = 60_000;
const NOT_NULL_VIOLATION = '23502';
const SUCCESS = 0;

// The last migration on main before this feature (the password columns).
const LAST_MIGRATION_BEFORE_ADMIN = 1790985600014;
const ADMIN_MIGRATION_NAME = /^\d+_users-is-admin\.js$/;
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

function adminMigrationTimestamp(): number {
  const [adminMigration] = migrationFiles().filter((name) => ADMIN_MIGRATION_NAME.test(name));
  expect(adminMigration, 'no *_users-is-admin.js migration').toBeDefined();
  return timestampOf(adminMigration);
}

function countBeforeAdmin(): number {
  const adminTimestamp = adminMigrationTimestamp();
  return migrationFiles().filter((name) => timestampOf(name) < adminTimestamp).length;
}

function countFromAdmin(): number {
  const adminTimestamp = adminMigrationTimestamp();
  return migrationFiles().filter((name) => timestampOf(name) >= adminTimestamp).length;
}

function migrateUp(count?: number): void {
  const { output, status } = runMigrations(scratch.databaseUrl, 'up', count === undefined ? [] : [String(count)]);
  expect(status, output).toBe(SUCCESS);
}

function migrateDownToBeforeAdmin(): void {
  // A count of 0 would revert every migration, so there must be one to revert.
  expect(countFromAdmin()).toBeGreaterThan(0);
  const { output, status } = runMigrations(scratch.databaseUrl, 'down', [String(countFromAdmin())]);
  expect(status, output).toBe(SUCCESS);
}

async function columnShape(pool: pg.Pool): Promise<ColumnShape | undefined> {
  const { rows } = await pool.query<ColumnShape>(
    `SELECT column_default, is_nullable, udt_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_admin'`,
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

describe.skipIf(SKIP_DATABASE_TESTS)('users.is_admin migration', () => {
  beforeEach(async () => {
    scratch = await createScratchDatabase(inject('testDatabaseUrl'));
  });

  afterEach(async () => {
    await scratch.drop();
  });

  it('exists as one migration after the password migration', () => {
    const adminMigrations = migrationFiles().filter((name) => ADMIN_MIGRATION_NAME.test(name));
    expect(adminMigrations).toHaveLength(1);
    expect(timestampOf(adminMigrations[0])).toBeGreaterThan(LAST_MIGRATION_BEFORE_ADMIN);
  });

  it(
    'adds is_admin as a boolean, NOT NULL, defaulting to false, and refuses NULL',
    async () => {
      migrateUp();
      const { pool } = scratch;

      const shape = await columnShape(pool);
      expect(shape).toMatchObject({ is_nullable: 'NO', udt_name: 'bool' });
      expect(shape?.column_default).toBe('false');

      const userId = await insertUser(pool);
      const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
      expect(rows).toEqual([{ is_admin: false }]);
      await expect(pool.query('UPDATE users SET is_admin = NULL WHERE id = $1', [userId])).rejects.toMatchObject({
        code: NOT_NULL_VIOLATION,
      });
    },
    MIGRATION_TIMEOUT_MS,
  );

  it(
    'reads false for a user that existed before the migration',
    async () => {
      migrateUp(countBeforeAdmin());
      const { pool } = scratch;
      expect(await columnShape(pool)).toBeUndefined();
      const userId = await insertUser(pool);

      migrateUp();

      const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
      expect(rows).toEqual([{ is_admin: false }]);
    },
    MIGRATION_TIMEOUT_MS,
  );

  it(
    'removes the column on down, keeping the users, and adds it back as false on up',
    async () => {
      migrateUp();
      const { pool } = scratch;
      const adminId = await insertUser(pool);
      const learnerId = await insertUser(pool);
      await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [adminId]);

      migrateDownToBeforeAdmin();

      expect(await columnShape(pool)).toBeUndefined();
      const { rows: afterDown } = await pool.query<{ id: string }>('SELECT id FROM users');
      expect(afterDown.map(({ id }) => id).sort()).toEqual([adminId, learnerId].sort());

      migrateUp();

      const { rows: afterUp } = await pool.query('SELECT DISTINCT is_admin FROM users');
      expect(afterUp).toEqual([{ is_admin: false }]);
    },
    MIGRATION_TIMEOUT_MS,
  );
});
