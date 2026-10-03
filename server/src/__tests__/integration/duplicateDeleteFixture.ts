// Shared by the B-59.6 duplicate-deletion tests: drives two DELETE /v1/me requests for one user
// and a POST /v1/auth/codes for the same email through a fixed, deterministic interleaving, with
// no fixed sleeps. A helper transaction holds the email's advisory lock; DELETE #1, then the code
// issue, then DELETE #2 are each started only once the previous one is visibly waiting on that
// lock in pg_locks. Postgres grants the queued waiters in order on release, so DELETE #1 commits,
// then the code issue commits its new code, then DELETE #2 runs against a user that is gone.
// Logs go through the production logger (real redaction config) to an in-memory sink.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import type pg from 'pg';
import request from 'supertest';

import { createLogger } from '../../clients/logger.js';
import { AUTH } from '../../constants/auth.js';
import { createAuthTestApp } from './createAuthTestApp.js';
import { insertSession } from './insertSession.js';

const DELETE_ME_ROUTE = '/v1/me';
const CODES_ROUTE = '/v1/auth/codes';
const COOKIE_NAME = AUTH.SESSION.COOKIE_NAME;
const HEX_BYTES = 6;
const BLOCKED_DEADLINE_MS = 4_000;
const POLL_INTERVAL_MS = 20;
const CALLER_IP = '198.51.100.9';
const ACCOUNT_DELETED = 'account deleted';

interface DuplicateDeleteOutcome {
  codeIssue: request.Response;
  email: string;
  firstDelete: request.Response;
  lines: string[];
  secondDelete: request.Response;
  userId: string;
}

function buildEmail(): string {
  return `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
}

async function countWhere(pool: pg.Pool, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(sql, params);
  const [{ count }] = rows;
  return Number(count);
}

// Polls until this many backends wait, ungranted, on the email's 64-bit advisory lock.
async function waitForAdvisoryWaiters(pool: pg.Pool, email: string, wanted: number): Promise<void> {
  const deadline = Date.now() + BLOCKED_DEADLINE_MS;
  const sql = `SELECT count(*) FROM pg_locks
     WHERE locktype = 'advisory' AND NOT granted
       AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
       AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`;
  while ((await countWhere(pool, sql, [email])) < wanted) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${wanted} waiter(s) on the email advisory lock`);
    }
    await delay(POLL_INTERVAL_MS);
  }
}

function deleteWithCookie(app: ReturnType<typeof createAuthTestApp>['app'], sessionToken: string) {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
    .set('X-Requested-With', 'XMLHttpRequest')
    .then((response) => response);
}

async function runDuplicateDelete(pool: pg.Pool): Promise<DuplicateDeleteOutcome> {
  const lines: string[] = [];
  const destination = {
    write(chunk: string): void {
      lines.push(...chunk.split('\n').filter((line) => line.length > 0));
    },
  };
  const { app, clock } = createAuthTestApp({ logger: createLogger({ destination }), pool });
  const email = buildEmail();
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
    [email, 'Europe/London'],
  );
  const [{ id: userId }] = rows;
  const { sessionToken: firstToken } = await insertSession(pool, { createdAt: clock.now(), userId });
  const { sessionToken: secondToken } = await insertSession(pool, { createdAt: clock.now(), userId });

  const holder = await pool.connect();
  let firstDeleting: Promise<request.Response> | undefined;
  let issuing: Promise<request.Response> | undefined;
  let secondDeleting: Promise<request.Response> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [email]);
    firstDeleting = deleteWithCookie(app, firstToken);
    await waitForAdvisoryWaiters(pool, email, 1);
    issuing = request(app)
      .post(CODES_ROUTE)
      .set('X-Forwarded-For', CALLER_IP)
      .send({ email })
      .then((response) => response);
    await waitForAdvisoryWaiters(pool, email, 2);
    secondDeleting = deleteWithCookie(app, secondToken);
    await waitForAdvisoryWaiters(pool, email, 3);
  } finally {
    await holder.query('COMMIT').catch(() => undefined);
    holder.release();
  }
  if (!firstDeleting || !issuing || !secondDeleting) {
    throw new Error('the duplicate deletion interleaving did not start');
  }
  const [firstDelete, codeIssue, secondDelete] = await Promise.all([firstDeleting, issuing, secondDeleting]);
  return { codeIssue, email, firstDelete, lines, secondDelete, userId };
}

function accountDeletedLines(lines: string[]): string[] {
  return lines.filter((line) => (JSON.parse(line) as { msg?: unknown }).msg === ACCOUNT_DELETED);
}

export { accountDeletedLines, COOKIE_NAME, countWhere, runDuplicateDelete };
export type { DuplicateDeleteOutcome };
