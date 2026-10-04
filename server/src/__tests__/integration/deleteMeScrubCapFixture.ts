// Shared by the B-59.13 bounded-scrub tests: an auth test app logging to an in-memory sink (the scrub caps
// passed through to createAuthTestApp when given), an account with two sessions, a one-time code and one
// purchase row linked to it, bulk unlinked purchase rows that carry the account's email (so each is a scrub
// candidate), and a snapshot of every fixture table cheap enough for thousands of large payloads.
import { createHash, randomBytes } from 'node:crypto';

import type pg from 'pg';
import request from 'supertest';

import { createLogger } from '../../clients/logger.js';
import { AUTH } from '../../constants/auth.js';
import { createAuthTestApp } from './createAuthTestApp.js';
import { insertSession } from './insertSession.js';

const DELETE_ME_ROUTE = '/v1/me';
const COOKIE_NAME = AUTH.SESSION.COOKIE_NAME;
const CODE_TTL_MS = AUTH.CODE.TTL_MS;
const HEX_BYTES = 6;
const CODE_SEED_BYTES = 16;
const PRODUCT_ID = 'bank-advanced';

interface ScrubCaps {
  deletionScrubMaxBytes?: number;
  deletionScrubMaxRows?: number;
}

interface ScrubCapApp {
  app: ReturnType<typeof createAuthTestApp>['app'];
  clock: ReturnType<typeof createAuthTestApp>['clock'];
  lines: string[];
}

interface SeededAccount {
  email: string;
  sessionToken: string;
  userId: string;
}

function createScrubCapApp(pool: pg.Pool, caps: ScrubCaps = {}): ScrubCapApp {
  const lines: string[] = [];
  const destination = {
    write(chunk: string): void {
      lines.push(...chunk.split('\n').filter((line) => line.length > 0));
    },
  };
  // The scrub caps are optional auth deps (B-59.13); omitted, the AUTH.DELETION defaults apply.
  const options = {
    logger: createLogger({ destination }),
    pool,
    ...caps,
  } as Parameters<typeof createAuthTestApp>[0];
  const { app, clock } = createAuthTestApp(options);
  return { app, clock, lines };
}

// One account: two sessions, a live one-time code, and one purchase row linked to it (itself a scrub candidate).
async function seedAccount(pool: pg.Pool, now: Date): Promise<SeededAccount> {
  const email = `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
    [email, 'Europe/London'],
  );
  const [{ id: userId }] = rows;
  const { sessionToken } = await insertSession(pool, {
    createdAt: now,
    userId,
  });
  await insertSession(pool, { createdAt: now, userId });
  await pool.query('INSERT INTO one_time_codes (email, code_hash, created_at, expires_at) VALUES ($1, $2, $3, $4)', [
    email,
    createHash('sha256').update(randomBytes(CODE_SEED_BYTES)).digest(),
    now,
    new Date(now.getTime() + CODE_TTL_MS),
  ]);
  await pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     VALUES ('revenuecat', $1, 'purchase', $2, $3, $4, $5)`,
    [
      `evt-own-${randomBytes(HEX_BYTES).toString('hex')}`,
      now,
      JSON.stringify({
        event: {
          app_user_id: userId,
          product_id: PRODUCT_ID,
          subscriber_attributes: { $email: { value: email } },
        },
      }),
      PRODUCT_ID,
      userId,
    ],
  );
  return { email, sessionToken, userId };
}

// `count` unlinked purchase rows (user_id null), each carrying the email as its `$email` attribute and a padding
// string of `paddingLength` ASCII characters, inserted in one statement.
async function insertUnlinkedCandidates(
  pool: pg.Pool,
  { count, email, paddingLength }: { count: number; email: string; paddingLength: number },
): Promise<void> {
  await pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     SELECT 'revenuecat', 'evt-bulk-' || n, 'purchase', now(),
            jsonb_build_object('event', jsonb_build_object(
              'product_id', $4::text,
              'note', repeat('x', $3::int),
              'subscriber_attributes', jsonb_build_object('$email', jsonb_build_object('value', $1::text)))),
            $4::text, NULL
     FROM generate_series(1, $2::int) AS n`,
    [email, count, paddingLength, PRODUCT_ID],
  );
}

// `count` purchase rows linked to another user, carrying no identity of the account and no `%`: never candidates.
async function insertOtherUsersRows(pool: pg.Pool, count: number): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
    [`other-${randomBytes(HEX_BYTES).toString('hex')}@example.com`, 'Europe/London'],
  );
  const [{ id: otherUserId }] = rows;
  await pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     SELECT 'revenuecat', 'evt-other-' || n, 'purchase', now(),
            jsonb_build_object('event', jsonb_build_object('product_id', $3::text, 'app_user_id', $1::text)),
            $3::text, $1::uuid
     FROM generate_series(1, $2::int) AS n`,
    [otherUserId, count, PRODUCT_ID],
  );
}

// Every fixture row, in a stable order; purchase payloads as digests so thousands of large rows stay cheap.
// Session last_used_at is left out (requireSession moves it before the route runs), and so are the DELETE /v1/me
// limiter counters (B-59.12: they count on the pool, outside the deletion).
async function snapshot(pool: pg.Pool): Promise<Record<string, string[]>> {
  const queries: Record<string, string> = {
    one_time_codes: 'SELECT row_to_json(t)::text AS row FROM one_time_codes t',
    purchase_events:
      "SELECT provider || ':' || provider_event_id || ':' || coalesce(user_id::text, '') || ':' || md5(payload::text) AS row FROM purchase_events",
    rate_limit_counters:
      "SELECT row_to_json(t)::text AS row FROM rate_limit_counters t WHERE key NOT LIKE 'account-delete:%'",
    sessions:
      "SELECT json_build_object('id', id, 'user_id', user_id, 'revoked_at', revoked_at, 'expires_at', expires_at)::text AS row FROM sessions",
    users: 'SELECT row_to_json(t)::text AS row FROM users t',
  };
  const result: Record<string, string[]> = {};
  for (const [table, sql] of Object.entries(queries)) {
    const { rows } = await pool.query<{ row: string }>(`${sql} ORDER BY 1`);
    result[table] = rows.map(({ row }) => row);
  }
  return result;
}

async function countWhere(pool: pg.Pool, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(sql, params);
  const [{ count }] = rows;
  return Number(count);
}

function deleteWithCookie(app: ScrubCapApp['app'], sessionToken: string): Promise<request.Response> {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
    .set('X-Requested-With', 'XMLHttpRequest')
    .then((response) => response);
}

function messagesOf(lines: string[]): unknown[] {
  return lines.map((line) => (JSON.parse(line) as { msg?: unknown }).msg);
}

export {
  countWhere,
  createScrubCapApp,
  deleteWithCookie,
  insertOtherUsersRows,
  insertUnlinkedCandidates,
  messagesOf,
  seedAccount,
  snapshot,
};
export type { ScrubCapApp, ScrubCaps, SeededAccount };
