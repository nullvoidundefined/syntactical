// B-59.5: the deletion's lock waits are bounded. The deletion transaction sets a 5 second
// lock_timeout (and a 15 second statement_timeout), so when another transaction holds the email's
// advisory lock (pg_advisory_xact_lock(hashtextextended(email, 0))) past the lock timeout,
// DELETE /v1/me answers 500 within the bound and changes nothing; once the holder commits, a
// retry succeeds with 204. No timeout is injected: the test holds the lock past the production
// 5 seconds and requires the 500 to arrive in under 10.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AUTH } from '../../constants/auth.js';
import { rateLimitKey } from '../../services/rateLimitKey.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const DELETE_ME_ROUTE = '/v1/me';
const COOKIE_NAME = AUTH.SESSION.COOKIE_NAME;
const CODE_TTL_MS = AUTH.CODE.TTL_MS;
const WINDOW_MS = AUTH.RATE_LIMIT.WINDOW_MS;
const HTTP_NO_CONTENT = 204;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 40_000;
// The production lock_timeout is 5 seconds; the 500 must arrive after it fires and well before
// the 15 second statement_timeout.
const LOCK_TIMEOUT_FLOOR_MS = 4_500;
const RESPONSE_BOUND_MS = 10_000;
const HEX_BYTES = 6;
const CODE_SEED_BYTES = 16;
const PRODUCT_ID = 'bank-advanced';
const NO_RESPONSE = 'no response within the bound';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

interface Seed {
  email: string;
  sessionToken: string;
  userId: string;
}

async function seedAccount({ clock, rateLimitKeySecret }: TestApp): Promise<Seed> {
  const now = clock.now();
  const email = `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
  const { rows } = await database.pool.query<{ id: string }>(
    'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
    [email, 'Europe/London'],
  );
  const [{ id: userId }] = rows;
  const { sessionToken } = await insertSession(database.pool, { createdAt: now, userId });
  await insertSession(database.pool, { createdAt: now, userId });
  await database.pool.query(
    `INSERT INTO answer_events (user_id, event_id, bank_key, question_id, choice_index, is_correct, round_kind, answered_at)
     VALUES ($1, $2, 'core', 'q-1', 0, true, 'bank', $3)`,
    [userId, randomUUID(), now],
  );
  await database.pool.query(
    "INSERT INTO daily_progress (user_id, local_date, xp, is_goal_met) VALUES ($1, '2026-10-01', 30, true)",
    [userId],
  );
  await database.pool.query(
    'INSERT INTO one_time_codes (email, code_hash, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [
      email,
      createHash('sha256').update(randomBytes(CODE_SEED_BYTES)).digest(),
      now,
      new Date(now.getTime() + CODE_TTL_MS),
    ],
  );
  await database.pool.query('INSERT INTO rate_limit_counters (key, window_start, count) VALUES ($1, $2, $3)', [
    rateLimitKey(rateLimitKeySecret, AUTH.RATE_LIMIT_SCOPE.ISSUE_EMAIL, email),
    new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS),
    1,
  ]);
  await database.pool.query(
    "INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, $2, 'revenuecat', 'granted')",
    [userId, PRODUCT_ID],
  );
  await database.pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     VALUES ('revenuecat', $1, 'purchase', $2, $3, $4, $5)`,
    [
      `evt-${randomBytes(HEX_BYTES).toString('hex')}`,
      now,
      JSON.stringify({ event: { app_user_id: userId, product_id: PRODUCT_ID, subscriber_attributes: { $email: { value: email } } } }),
      PRODUCT_ID,
      userId,
    ],
  );
  return { email, sessionToken, userId };
}

// Every fixture row, in a stable order. Session last_used_at is left out: requireSession moves
// it on every authenticated request, before the route runs.
async function snapshot(): Promise<Record<string, string[]>> {
  const queries: Record<string, string> = {
    answer_events: 'SELECT row_to_json(t)::text AS row FROM answer_events t',
    daily_progress: 'SELECT row_to_json(t)::text AS row FROM daily_progress t',
    entitlements: 'SELECT row_to_json(t)::text AS row FROM entitlements t',
    one_time_codes: 'SELECT row_to_json(t)::text AS row FROM one_time_codes t',
    purchase_events: 'SELECT row_to_json(t)::text AS row FROM purchase_events t',
    // The DELETE /v1/me limiters (B-59.12) count every request on the pool, outside the deletion.
    rate_limit_counters:
      "SELECT row_to_json(t)::text AS row FROM rate_limit_counters t WHERE key NOT LIKE 'account-delete:%'",
    sessions:
      "SELECT json_build_object('id', id, 'user_id', user_id, 'revoked_at', revoked_at, 'expires_at', expires_at)::text AS row FROM sessions",
    users: 'SELECT row_to_json(t)::text AS row FROM users t',
  };
  const result: Record<string, string[]> = {};
  for (const [table, sql] of Object.entries(queries)) {
    const { rows } = await database.pool.query<{ row: string }>(`${sql} ORDER BY 1`);
    result[table] = rows.map(({ row }) => row);
  }
  return result;
}

async function countWhere(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(sql, params);
  const [{ count }] = rows;
  return Number(count);
}

function deleteWithCookie({ app }: TestApp, sessionToken: string): Promise<request.Response> {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
    .set('X-Requested-With', 'XMLHttpRequest')
    .then((response) => response);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me lock waits', () => {
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
    'answers 500 within the bound and changes nothing while the email lock is held, then a retry gets 204',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const seed = await seedAccount(testApp);
      const before = await snapshot();

      const holder = await database.pool.connect();
      let isHolderOpen = true;
      let pending: Promise<request.Response> | undefined;
      const boundTimer = new AbortController();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [seed.email]);

        const startedAt = Date.now();
        pending = deleteWithCookie(testApp, seed.sessionToken);
        const outcome = await Promise.race([
          pending,
          delay(RESPONSE_BOUND_MS, NO_RESPONSE, { signal: boundTimer.signal }).catch(() => NO_RESPONSE),
        ]);
        const elapsedMs = Date.now() - startedAt;

        expect(typeof outcome === 'string' ? outcome : outcome.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
        expect(elapsedMs).toBeGreaterThanOrEqual(LOCK_TIMEOUT_FLOOR_MS);
        expect(elapsedMs).toBeLessThan(RESPONSE_BOUND_MS);
        expect(await snapshot()).toEqual(before);
        expect(before.users).toHaveLength(1);
        expect(before.sessions).toHaveLength(2);
        expect(before.one_time_codes).toHaveLength(1);
        expect(before.rate_limit_counters).toHaveLength(1);
        expect(before.purchase_events).toHaveLength(1);

        await holder.query('COMMIT');
        isHolderOpen = false;
        const retried = await deleteWithCookie(testApp, seed.sessionToken);

        expect(retried.status).toBe(HTTP_NO_CONTENT);
        expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [seed.userId])).toBe(0);
        expect(await countWhere('SELECT count(*) FROM sessions WHERE user_id = $1', [seed.userId])).toBe(0);
        expect(await countWhere('SELECT count(*) FROM one_time_codes WHERE email = $1', [seed.email])).toBe(0);
      } finally {
        boundTimer.abort();
        if (isHolderOpen) {
          await holder.query('COMMIT').catch(() => undefined);
        }
        holder.release();
        // A deletion still waiting on the lock finishes once the holder commits; let it end here.
        await pending?.catch(() => undefined);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
