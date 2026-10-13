import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { changePassword } from '../../services/changePassword.js';
import { lockUserPasswordHash } from '../../services/lockUserPasswordHash.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const LOCK_WAIT_MS = 200;
const NOW = new Date('2026-01-15T12:00:00.000Z');
const BEFORE = new Date(NOW.getTime() - 60_000);
const AFTER = new Date(NOW.getTime() + 60_000);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function buildHash(): string {
  // Satisfy the database prefix constraint; the service treats the rest as opaque.
  return '$scrypt$'.concat(randomBytes(16).toString('hex'));
}

async function insertUser(passwordHash: string | null): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, password_updated_at)
     VALUES ($1, $2, $3) RETURNING id`,
    [`learner-${randomUUID()}@example.com`, passwordHash, BEFORE],
  );
  return rows[0]!.id;
}

async function insertSession(userId: string, revokedAt: Date | null = null, expiresAt = AFTER): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, token_hash, created_at, last_used_at, expires_at, revoked_at, auth_method)
     VALUES ($1, $2, $3, $3, $4, $5, 'password') RETURNING id`,
    [userId, randomBytes(32), BEFORE, expiresAt, revokedAt],
  );
  return rows[0]!.id;
}

async function readUser(userId: string) {
  const { rows } = await database.pool.query<{ password_hash: string | null; password_updated_at: Date | null }>(
    'SELECT password_hash, password_updated_at FROM users WHERE id = $1',
    [userId],
  );
  return rows[0];
}

async function readSessions() {
  const { rows } = await database.pool.query('SELECT * FROM sessions ORDER BY id');
  return rows;
}

describe.skipIf(SKIP_DATABASE_TESTS)('changePassword and lockUserPasswordHash', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  beforeEach(async () => {
    await database.reset();
  });

  afterAll(async () => {
    await database?.drop();
  });

  it('saves the hash and timestamp, revoking only the other unrevoked sessions of this user', async () => {
    const storedHash = buildHash();
    const newHash = buildHash();
    const userId = await insertUser(storedHash);
    const sessionId = await insertSession(userId);
    const liveSessionId = await insertSession(userId);
    await insertSession(userId, BEFORE);
    const expiredSessionId = await insertSession(userId, null, NOW);
    const otherUserId = await insertUser(buildHash());
    await insertSession(otherUserId);
    const before = await readSessions();

    expect(await changePassword(database.pool, { newHash, now: NOW, sessionId, storedHash, userId })).toBe('saved');

    expect(await readUser(userId)).toEqual({ password_hash: newHash, password_updated_at: NOW });
    expect(await readSessions()).toEqual(
      before.map((session) =>
        session.id === liveSessionId || session.id === expiredSessionId ? { ...session, revoked_at: NOW } : session,
      ),
    );
  });

  it.each(['different string', 'null'] as const)(
    'returns changed without writes for a %s stored hash',
    async (kind) => {
      const storedHash = buildHash();
      const userId = await insertUser(kind === 'null' ? null : buildHash());
      const sessionId = await insertSession(userId);
      await insertSession(userId);
      await insertSession(userId, BEFORE);
      const userBefore = await readUser(userId);
      const sessionsBefore = await readSessions();

      expect(
        await changePassword(database.pool, { newHash: buildHash(), now: NOW, sessionId, storedHash, userId }),
      ).toBe('changed');

      expect(await readUser(userId)).toEqual(userBefore);
      expect(await readSessions()).toEqual(sessionsBefore);
    },
  );

  it('returns changed when the user does not exist', async () => {
    const userId = randomUUID();

    expect(
      await changePassword(database.pool, {
        newHash: buildHash(),
        now: NOW,
        sessionId: randomUUID(),
        storedHash: null,
        userId,
      }),
    ).toBe('changed');

    expect(await readUser(userId)).toBeUndefined();
    expect(await readSessions()).toEqual([]);
  });

  it.each(['revoked', 'expired', 'missing'] as const)(
    'returns session-gone without writes when the requesting session is %s',
    async (kind) => {
      const storedHash = buildHash();
      const userId = await insertUser(storedHash);
      const sessionId =
        kind === 'missing'
          ? randomUUID()
          : await insertSession(userId, kind === 'revoked' ? BEFORE : null, kind === 'expired' ? NOW : AFTER);
      await insertSession(userId);
      await insertSession(userId, BEFORE);
      const userBefore = await readUser(userId);
      const sessionsBefore = await readSessions();

      expect(
        await changePassword(database.pool, { newHash: buildHash(), now: NOW, sessionId, storedHash, userId }),
      ).toBe('session-gone');

      expect(await readUser(userId)).toEqual(userBefore);
      expect(await readSessions()).toEqual(sessionsBefore);
    },
  );

  it('resolves the hash string, null for a user without a password, and undefined for a missing user', async () => {
    const hash = buildHash();
    const userId = await insertUser(hash);
    const userWithoutPasswordId = await insertUser(null);
    const client = await database.pool.connect();
    try {
      expect(await lockUserPasswordHash(client, userId)).toBe(hash);
      expect(await lockUserPasswordHash(client, userWithoutPasswordId)).toBeNull();
      expect(await lockUserPasswordHash(client, randomUUID())).toBeUndefined();
    } finally {
      client.release();
    }
  });

  it(
    'serializes row locks until the first transaction commits',
    async () => {
      const hash = buildHash();
      const userId = await insertUser(hash);
      const clientA = await database.pool.connect();
      try {
        const clientB = await database.pool.connect();
        try {
          await clientA.query('BEGIN');
          expect(await lockUserPasswordHash(clientA, userId)).toBe(hash);
          await clientB.query('BEGIN');
          // Bound a broken implementation so cleanup cannot hang on its lock request.
          await clientB.query("SET LOCAL statement_timeout = '5s'");
          const pending = lockUserPasswordHash(clientB, userId);
          const settlement = pending.then(
            () => 'resolved',
            () => 'rejected',
          );

          expect(await Promise.race([settlement, setTimeout(LOCK_WAIT_MS, 'waiting')])).toBe('waiting');
          await clientA.query('COMMIT');
          expect(await pending).toBe(hash);
          await clientB.query('COMMIT');
        } finally {
          // Release A's lock before waiting for any queued B rollback.
          try {
            await clientA.query('ROLLBACK');
          } finally {
            try {
              await clientB.query('ROLLBACK');
            } finally {
              clientB.release();
            }
          }
        }
      } finally {
        clientA.release();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
