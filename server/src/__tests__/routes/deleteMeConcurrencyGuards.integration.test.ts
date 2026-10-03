// B-59.4: DELETE /v1/me under concurrency, against a real Postgres, with deterministic
// interleavings and no fixed sleeps. A transaction held open on another pooled client forces each
// race; the test waits until the deletion is observably blocked (pg_locks / pg_stat_activity)
// before letting the holder finish.
// - A code issue in flight for the same email (holding the per-email advisory lock) when the
//   deletion starts: the deletion waits for that lock, and afterwards no code for the email exists.
// - A sign-in verify holding the user's newest code row FOR UPDATE when the deletion starts: both
//   finish without a deadlock, and no session for the deleted user id remains.
// - Two DELETE /v1/me requests for the same user at once: each is 204 or 401, never 500.
// These pass against the implementation as written; they guard the lock order from regressions.
import { randomBytes, randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AUTH } from '../../constants/auth.js';
import { createSession } from '../../services/createSession.js';
import { sha256 } from '../../services/sha256.js';
import { verifyOneTimeCode } from '../../services/verifyOneTimeCode.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const DELETE_ME_ROUTE = '/v1/me';
const CODES_ROUTE = '/v1/auth/codes';
const COOKIE_NAME = AUTH.SESSION.COOKIE_NAME;
const CODE_TTL_MS = AUTH.CODE.TTL_MS;
const CODE_DIGITS = 6;
const CODE_SPACE = 1_000_000;
const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const BLOCKED_DEADLINE_MS = 10_000;
const POLL_INTERVAL_MS = 20;
const HEX_BYTES = 6;
const CALLER_IP = '198.51.100.7';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

function buildEmail(): string {
  return `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
}

function buildCode(): string {
  return String(randomInt(0, CODE_SPACE)).padStart(CODE_DIGITS, '0');
}

async function insertUser(email: string): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
    [email, 'Europe/London'],
  );
  const [{ id }] = rows;
  return id;
}

async function insertCode(email: string, code: string, now: Date): Promise<void> {
  await database.pool.query(
    'INSERT INTO one_time_codes (email, code_hash, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [email, sha256(code), now, new Date(now.getTime() + CODE_TTL_MS)],
  );
}

async function countWhere(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(sql, params);
  const [{ count }] = rows;
  return Number(count);
}

// Polls until the condition's count reaches the wanted number, or fails the test at the deadline.
async function waitUntilCount(sql: string, params: unknown[], wanted: number, what: string): Promise<void> {
  const deadline = Date.now() + BLOCKED_DEADLINE_MS;
  while ((await countWhere(sql, params)) < wanted) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await delay(POLL_INTERVAL_MS);
  }
}

// Backends in this database waiting, ungranted, for the email's 64-bit advisory lock.
function waitForAdvisoryWaiters(email: string, wanted: number): Promise<void> {
  return waitUntilCount(
    `SELECT count(*) FROM pg_locks
     WHERE locktype = 'advisory' AND NOT granted
       AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
       AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`,
    [email],
    wanted,
    `${wanted} waiter(s) on the email advisory lock`,
  );
}

// Backends blocked by the given backend pid.
function waitForBlockedBy(holderPid: number, wanted: number): Promise<void> {
  return waitUntilCount(
    'SELECT count(*) FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
    [holderPid],
    wanted,
    `${wanted} backend(s) blocked by the holder`,
  );
}

async function backendPid(client: pg.PoolClient): Promise<number> {
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  const [{ pid }] = rows;
  return pid;
}

function deleteWithCookie({ app }: TestApp, sessionToken: string): Promise<request.Response> {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
    .set('X-Requested-With', 'XMLHttpRequest')
    .then((response) => response);
}

function deleteWithBearer({ app }: TestApp, sessionToken: string): Promise<request.Response> {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Authorization', `Bearer ${sessionToken}`)
    .then((response) => response);
}

// A gate the email send waits on: reached resolves when the send starts, open() lets it finish.
function createGate() {
  let open = (): void => undefined;
  let markReached = (): void => undefined;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    open: () => open(),
    reached,
    async wait(): Promise<void> {
      markReached();
      await opened;
    },
  };
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me under concurrency', () => {
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
    'waits for an in-flight code issue for the same email and leaves no code for the email',
    async () => {
      const gate = createGate();
      const testApp = createAuthTestApp({ pool: database.pool, sendSignInCode: () => gate.wait() });
      const email = buildEmail();
      const userId = await insertUser(email);
      const { sessionToken } = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });

      // The issue holds the email's advisory lock with its new code inserted, until the gate opens.
      const issuing = request(testApp.app)
        .post(CODES_ROUTE)
        .set('X-Forwarded-For', CALLER_IP)
        .send({ email })
        .then((response) => response);
      let deleting: Promise<request.Response> | undefined;
      try {
        await gate.reached;
        deleting = deleteWithCookie(testApp, sessionToken);
        await waitForAdvisoryWaiters(email, 1);
      } finally {
        gate.open();
      }
      const [issued, deleted] = await Promise.all([issuing, deleting]);

      expect(issued.status).toBe(HTTP_ACCEPTED);
      expect(deleted?.status).toBe(HTTP_NO_CONTENT);
      expect(await countWhere('SELECT count(*) FROM one_time_codes WHERE lower(email::text) = lower($1)', [email])).toBe(
        0,
      );
      expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'finishes alongside a sign-in verify holding the newest code row, with no deadlock and no session left',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const now = testApp.clock.now();
      const email = buildEmail();
      const code = buildCode();
      const userId = await insertUser(email);
      const { sessionToken } = await insertSession(database.pool, { createdAt: now, userId });
      await insertCode(email, code, now);

      const holder = await database.pool.connect();
      let deleting: Promise<request.Response> | undefined;
      let signedInUserId: string | undefined;
      try {
        const holderPid = await backendPid(holder);
        await holder.query('BEGIN');
        // Sign-in's own steps on the holder: the verify locks the newest code row FOR UPDATE.
        const isValid = await verifyOneTimeCode(holder, { code, email, now });
        expect(isValid).toBe(true);
        deleting = deleteWithCookie(testApp, sessionToken);
        await waitForBlockedBy(holderPid, 1);
        // Then the user upsert and session insert, as sign-in does, and the commit.
        const created = await createSession(holder, { email, now, timezone: undefined });
        signedInUserId = created.userId;
        await holder.query('COMMIT');
      } catch (error) {
        await holder.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        holder.release();
        await deleting?.catch(() => undefined);
      }
      const deleted = await deleting;

      expect(signedInUserId).toBe(userId);
      expect(deleted?.status).toBe(HTTP_NO_CONTENT);
      expect(await countWhere('SELECT count(*) FROM sessions WHERE user_id = $1', [userId])).toBe(0);
      expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'answers two simultaneous deletions for one user with 204 or 401 each, never 500',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const now = testApp.clock.now();
      const email = buildEmail();
      const userId = await insertUser(email);
      const { sessionToken: cookieToken } = await insertSession(database.pool, { createdAt: now, userId });
      const { sessionToken: bearerToken } = await insertSession(database.pool, { createdAt: now, userId });

      // Holding the email's advisory lock lines both deletions up behind it, then releases them together.
      const holder = await database.pool.connect();
      let deletions: Promise<request.Response[]> | undefined;
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [email]);
        deletions = Promise.all([deleteWithCookie(testApp, cookieToken), deleteWithBearer(testApp, bearerToken)]);
        await waitForAdvisoryWaiters(email, 2);
      } finally {
        await holder.query('COMMIT').catch(() => undefined);
        holder.release();
      }
      const responses = (await deletions) ?? [];

      expect(responses).toHaveLength(2);
      for (const { status } of responses) {
        expect([HTTP_NO_CONTENT, HTTP_UNAUTHORIZED]).toContain(status);
      }
      expect(responses.map(({ status }) => status)).toContain(HTTP_NO_CONTENT);
      expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(0);
      expect(await countWhere('SELECT count(*) FROM sessions WHERE user_id = $1', [userId])).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
