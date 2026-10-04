// B-59.2: DELETE /v1/me deletes the caller's account in one transaction against a real Postgres.
// The user, every session, answer event, progress row, and goal change go; every one-time code
// and email-scoped rate-limit counter for the email goes; entitlements and purchase events stay
// with user_id null and their payloads scrubbed. No public table then holds the email or the
// user id. When any statement fails the response is 500 and nothing has changed.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AUTH } from '../../constants/auth.js';
import { rateLimitKey } from '../../services/rateLimitKey.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const DELETE_ME_ROUTE = '/v1/me';
const CODES_ROUTE = '/v1/auth/codes';
const SESSIONS_ROUTE = '/v1/auth/sessions';
const COOKIE_NAME = AUTH.SESSION.COOKIE_NAME;
const HTTP_CREATED = 201;
const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const SETUP_TIMEOUT_MS = 120_000;
const HEX_BYTES = 6;
const CODE_SEED_BYTES = 16;
const CODE_TTL_MS = AUTH.CODE.TTL_MS;
const WINDOW_MS = AUTH.RATE_LIMIT.WINDOW_MS;
const EPOCH_EXPIRY = 'expires=thu, 01 jan 1970 00:00:00 gmt';
const DELETED = '[deleted]';
const PRODUCT_ID = 'bank-advanced';
const PRICE = 4.99;
const UPDATED_AT_MS = 1_790_000_000_000;
const ANONYMOUS_ALIAS = '$RCAnonymousID:a1b2c3';
const CALLER_IP = '198.51.100.7';
const OTHER_IP = '203.0.113.9';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

interface Identity {
  email: string;
  mixedCaseEmail: string;
  upperCaseEmail: string;
}

interface Seed {
  caller: { sessionToken: string };
  email: string;
  identity: Identity;
  otherEmail: string;
  otherUserId: string;
  userId: string;
}

function buildIdentity(): Identity {
  const local = randomBytes(HEX_BYTES).toString('hex');
  return {
    email: `learner-${local}@example.com`,
    mixedCaseEmail: `Learner-${local.toUpperCase()}@Example.COM`,
    upperCaseEmail: `LEARNER-${local.toUpperCase()}@EXAMPLE.COM`,
  };
}

function codeHash(): Buffer {
  return createHash('sha256').update(randomBytes(CODE_SEED_BYTES)).digest();
}

function windowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
}

function linkedPayload(userId: string, mixedCaseEmail: string) {
  return {
    event: {
      aliases: [userId, ANONYMOUS_ALIAS],
      app_user_id: userId,
      price: PRICE,
      product_id: PRODUCT_ID,
      subscriber_attributes: {
        $displayName: { updated_at_ms: UPDATED_AT_MS, value: 'Ada Lovelace' },
        $email: { updated_at_ms: UPDATED_AT_MS, value: mixedCaseEmail },
      },
      type: 'INITIAL_PURCHASE',
    },
  };
}

function scrubbedLinkedPayload() {
  return {
    event: {
      aliases: [DELETED, ANONYMOUS_ALIAS],
      app_user_id: DELETED,
      price: PRICE,
      product_id: PRODUCT_ID,
      subscriber_attributes: {
        $displayName: { updated_at_ms: UPDATED_AT_MS, value: DELETED },
        $email: { updated_at_ms: UPDATED_AT_MS, value: DELETED },
      },
      type: 'INITIAL_PURCHASE',
    },
  };
}

function unlinkedPayload(userId: string, mixedCaseEmail: string) {
  return {
    event: {
      contact: `mailto:${mixedCaseEmail}`,
      original_app_user_id: userId,
      product_id: PRODUCT_ID,
      store: 'APP_STORE',
      type: 'TRANSFER',
    },
  };
}

function scrubbedUnlinkedPayload() {
  return {
    event: {
      contact: DELETED,
      original_app_user_id: DELETED,
      product_id: PRODUCT_ID,
      store: 'APP_STORE',
      type: 'TRANSFER',
    },
  };
}

function otherUserPayload(otherUserId: string, otherEmail: string) {
  return {
    event: {
      app_user_id: otherUserId,
      product_id: PRODUCT_ID,
      subscriber_attributes: { $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail } },
      type: 'RENEWAL',
    },
  };
}

async function insertUser(email: string): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
    [email, 'Europe/London'],
  );
  const [{ id }] = rows;
  return id;
}

async function insertAnswerEvent(userId: string, answeredAt: Date): Promise<void> {
  await database.pool.query(
    `INSERT INTO answer_events (user_id, event_id, bank_key, question_id, choice_index, is_correct, round_kind, answered_at)
     VALUES ($1, $2, 'core', 'q-1', 0, true, 'bank', $3)`,
    [userId, randomUUID(), answeredAt],
  );
}

async function insertCode(
  email: string,
  now: Date,
  { invalidatedAt = null, usedAt = null }: { invalidatedAt?: Date | null; usedAt?: Date | null } = {},
): Promise<void> {
  await database.pool.query(
    `INSERT INTO one_time_codes (email, code_hash, created_at, expires_at, used_at, invalidated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [email, codeHash(), now, new Date(now.getTime() + CODE_TTL_MS), usedAt, invalidatedAt],
  );
}

async function insertCounter(key: string, now: Date, count: number): Promise<void> {
  await database.pool.query('INSERT INTO rate_limit_counters (key, window_start, count) VALUES ($1, $2, $3)', [
    key,
    windowStart(now),
    count,
  ]);
}

async function insertPurchaseEvent(userId: string | null, payload: unknown, now: Date): Promise<string> {
  const providerEventId = `evt-${randomBytes(HEX_BYTES).toString('hex')}`;
  await database.pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     VALUES ('revenuecat', $1, 'purchase', $2, $3, $4, $5)`,
    [providerEventId, now, JSON.stringify(payload), PRODUCT_ID, userId],
  );
  return providerEventId;
}

// The account to delete, with a row in every table that can hold its identity, plus another
// user and another email whose rows must survive.
async function seedAccount(testApp: TestApp): Promise<Seed & { eventIds: Record<string, string> }> {
  const { clock, rateLimitKeySecret } = testApp;
  const now = clock.now();
  const identity = buildIdentity();
  const { email, mixedCaseEmail, upperCaseEmail } = identity;
  const { email: otherEmail } = buildIdentity();
  const userId = await insertUser(email);
  const otherUserId = await insertUser(otherEmail);

  const caller = await insertSession(database.pool, { createdAt: now, userId });
  await insertSession(database.pool, { createdAt: now, userId });
  await insertSession(database.pool, { createdAt: now, revokedAt: now, userId });
  await insertSession(database.pool, { createdAt: now, userId: otherUserId });

  await insertAnswerEvent(userId, now);
  await insertAnswerEvent(userId, now);
  await insertAnswerEvent(otherUserId, now);
  await database.pool.query(
    "INSERT INTO daily_progress (user_id, local_date, xp, is_goal_met) VALUES ($1, '2026-10-01', 30, true)",
    [userId],
  );
  await database.pool.query("INSERT INTO daily_goal_changes (user_id, from_date, goal) VALUES ($1, '2026-09-01', 20)", [
    userId,
  ]);

  await insertCode(email, now);
  await insertCode(mixedCaseEmail, now, { usedAt: now });
  await insertCode(upperCaseEmail, now, { invalidatedAt: now });
  await insertCode(otherEmail, now);

  const { ISSUE_EMAIL, ISSUE_IP, VERIFY_EMAIL, VERIFY_IP } = AUTH.RATE_LIMIT_SCOPE;
  const { ISSUE_PER_EMAIL, VERIFY_PER_EMAIL } = AUTH.RATE_LIMIT;
  // At the limit, so a counter deletion leaves behind would make the re-sign-in a 429.
  await insertCounter(rateLimitKey(rateLimitKeySecret, ISSUE_EMAIL, email), now, ISSUE_PER_EMAIL);
  await insertCounter(rateLimitKey(rateLimitKeySecret, VERIFY_EMAIL, email), now, VERIFY_PER_EMAIL);
  await insertCounter(rateLimitKey(rateLimitKeySecret, ISSUE_IP, OTHER_IP), now, 1);
  await insertCounter(rateLimitKey(rateLimitKeySecret, VERIFY_IP, OTHER_IP), now, 1);
  await insertCounter(rateLimitKey(rateLimitKeySecret, ISSUE_EMAIL, otherEmail), now, 1);

  await database.pool.query(
    "INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, $2, 'revenuecat', 'granted')",
    [userId, PRODUCT_ID],
  );
  const eventIds = {
    linked: await insertPurchaseEvent(userId, linkedPayload(userId, mixedCaseEmail), now),
    other: await insertPurchaseEvent(otherUserId, otherUserPayload(otherUserId, otherEmail), now),
    unlinked: await insertPurchaseEvent(null, unlinkedPayload(userId, mixedCaseEmail), now),
  };

  return { caller, email, eventIds, identity, otherEmail, otherUserId, userId };
}

async function countWhere(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(sql, params);
  const [{ count }] = rows;
  return Number(count);
}

async function payloadOf(providerEventId: string): Promise<{ payload: unknown; user_id: string | null }> {
  const { rows } = await database.pool.query<{ payload: unknown; user_id: string | null }>(
    'SELECT payload, user_id FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [row] = rows;
  return row;
}

// Every column of every row in every public table, cast to text, searched case-insensitively.
async function tablesHolding(needle: string): Promise<string[]> {
  const { rows: tables } = await database.pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  const holding: string[] = [];
  for (const { table_name: tableName } of tables) {
    const count = await countWhere(`SELECT count(*) FROM public."${tableName}" t WHERE row_to_json(t)::text ILIKE $1`, [
      `%${needle}%`,
    ]);
    if (count > 0) {
      holding.push(tableName);
    }
  }
  return holding;
}

// Every fixture row, in a stable order. Session last_used_at is left out: requireSession moves
// it on every authenticated request, before the route runs.
async function snapshot(): Promise<Record<string, string[]>> {
  const queries: Record<string, string> = {
    answer_events: 'SELECT row_to_json(t)::text AS row FROM answer_events t',
    daily_goal_changes: 'SELECT row_to_json(t)::text AS row FROM daily_goal_changes t',
    daily_progress: 'SELECT row_to_json(t)::text AS row FROM daily_progress t',
    entitlements: 'SELECT row_to_json(t)::text AS row FROM entitlements t',
    one_time_codes: 'SELECT row_to_json(t)::text AS row FROM one_time_codes t',
    purchase_events: 'SELECT row_to_json(t)::text AS row FROM purchase_events t',
    // The DELETE /v1/me limiters (B-59.12) count every request on the pool, outside the deletion.
    rate_limit_counters:
      "SELECT row_to_json(t)::text AS row FROM rate_limit_counters t WHERE key NOT LIKE 'account-delete:%'",
    sessions:
      'SELECT json_build_object(\'id\', id, \'user_id\', user_id, \'revoked_at\', revoked_at, \'expires_at\', expires_at)::text AS row FROM sessions',
    users: 'SELECT row_to_json(t)::text AS row FROM users t',
  };
  const result: Record<string, string[]> = {};
  for (const [table, sql] of Object.entries(queries)) {
    const { rows } = await database.pool.query<{ row: string }>(`${sql} ORDER BY 1`);
    result[table] = rows.map(({ row }) => row);
  }
  return result;
}

function sessionCookie(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
}

function expectClearedCookie(response: request.Response): void {
  const cleared = sessionCookie(response);
  expect(cleared).toBeDefined();
  const attributes = String(cleared)
    .split(';')
    .map((part) => part.trim().toLowerCase());
  expect(attributes[0]).toBe(`${COOKIE_NAME}=`);
  expect(attributes).toContain(EPOCH_EXPIRY);
}

function deleteWithCookie({ app }: TestApp, sessionToken: string) {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
    .set('X-Requested-With', 'XMLHttpRequest');
}

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

async function expectAccountErased(seed: Seed & { eventIds: Record<string, string> }): Promise<void> {
  const { email, eventIds, otherEmail, otherUserId, userId } = seed;
  expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(0);
  expect(await countWhere('SELECT count(*) FROM sessions WHERE user_id = $1', [userId])).toBe(0);
  expect(await countWhere('SELECT count(*) FROM answer_events WHERE user_id = $1', [userId])).toBe(0);
  expect(await countWhere('SELECT count(*) FROM daily_progress WHERE user_id = $1', [userId])).toBe(0);
  expect(await countWhere('SELECT count(*) FROM daily_goal_changes WHERE user_id = $1', [userId])).toBe(0);
  expect(await countWhere('SELECT count(*) FROM one_time_codes WHERE lower(email::text) = lower($1)', [email])).toBe(0);

  // The other user and the other email keep every row.
  expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [otherUserId])).toBe(1);
  expect(await countWhere('SELECT count(*) FROM sessions WHERE user_id = $1', [otherUserId])).toBe(1);
  expect(await countWhere('SELECT count(*) FROM answer_events WHERE user_id = $1', [otherUserId])).toBe(1);
  expect(await countWhere('SELECT count(*) FROM one_time_codes WHERE email = $1', [otherEmail])).toBe(1);

  // Only the two email-scoped counters for the deleted email are gone (the B-59.12 per-IP counter for
  // DELETE /v1/me itself is left out of the count).
  const { rows: counters } = await database.pool.query<{ key: string }>(
    "SELECT key FROM rate_limit_counters WHERE key NOT LIKE 'account-delete:%'",
  );
  expect(counters).toHaveLength(3);
  const { ISSUE_EMAIL, VERIFY_EMAIL } = AUTH.RATE_LIMIT_SCOPE;
  const { rows: remaining } = await database.pool.query<{ key: string }>(
    'SELECT key FROM rate_limit_counters WHERE key LIKE $1 OR key LIKE $2',
    [`${ISSUE_EMAIL}:%`, `${VERIFY_EMAIL}:%`],
  );
  expect(remaining).toHaveLength(1);

  const { rows: entitlements } = await database.pool.query<{ product_id: string; user_id: string | null }>(
    'SELECT product_id, user_id FROM entitlements',
  );
  expect(entitlements).toEqual([{ product_id: PRODUCT_ID, user_id: null }]);

  expect(await payloadOf(eventIds.linked)).toEqual({ payload: scrubbedLinkedPayload(), user_id: null });
  expect(await payloadOf(eventIds.unlinked)).toEqual({ payload: scrubbedUnlinkedPayload(), user_id: null });
  expect(await payloadOf(eventIds.other)).toEqual({
    payload: otherUserPayload(otherUserId, otherEmail),
    user_id: otherUserId,
  });

  expect(await tablesHolding(email)).toEqual([]);
  expect(await tablesHolding(userId)).toEqual([]);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('deletes a cookie caller account, clears the cookie, and the same cookie then gets 401', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const seed = await seedAccount(testApp);

    const response = await deleteWithCookie(testApp, seed.caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(response.text).toBe('');
    expectClearedCookie(response);
    await expectAccountErased(seed);
    const again = await deleteWithCookie(testApp, seed.caller.sessionToken);
    expect(again.status).toBe(HTTP_UNAUTHORIZED);
  });

  it('deletes a bearer caller account, still clears the cookie, and the same token then gets 401', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const seed = await seedAccount(testApp);

    const response = await deleteWithBearer(testApp, seed.caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(response.text).toBe('');
    expectClearedCookie(response);
    await expectAccountErased(seed);
    const again = await deleteWithBearer(testApp, seed.caller.sessionToken);
    expect(again.status).toBe(HTTP_UNAUTHORIZED);
  });

  it('lets the same email sign in again as a new user with no entitlements, progress, or events', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const seed = await seedAccount(testApp);
    const deleted = await deleteWithBearer(testApp, seed.caller.sessionToken);

    const issued = await request(testApp.app)
      .post(CODES_ROUTE)
      .set('X-Forwarded-For', CALLER_IP)
      .send({ email: seed.identity.mixedCaseEmail });
    const { code } = testApp.sentCodes[testApp.sentCodes.length - 1] ?? { code: '' };
    const signedIn = await request(testApp.app)
      .post(SESSIONS_ROUTE)
      .set('X-Forwarded-For', CALLER_IP)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('X-Client', 'native')
      .send({ code, email: seed.email });

    expect(deleted.status).toBe(HTTP_NO_CONTENT);
    expect(issued.status).toBe(HTTP_ACCEPTED);
    expect(signedIn.status).toBe(HTTP_CREATED);
    const { rows: users } = await database.pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      seed.email,
    ]);
    expect(users).toHaveLength(1);
    const [{ id: newUserId }] = users;
    expect(newUserId).not.toBe(seed.userId);
    expect(await countWhere('SELECT count(*) FROM entitlements WHERE user_id = $1', [newUserId])).toBe(0);
    expect(await countWhere('SELECT count(*) FROM purchase_events WHERE user_id = $1', [newUserId])).toBe(0);
    expect(await countWhere('SELECT count(*) FROM answer_events WHERE user_id = $1', [newUserId])).toBe(0);
    expect(await countWhere('SELECT count(*) FROM daily_progress WHERE user_id = $1', [newUserId])).toBe(0);
    expect(await countWhere('SELECT count(*) FROM daily_goal_changes WHERE user_id = $1', [newUserId])).toBe(0);
  });

  it('answers 500 and changes nothing when a statement fails part way through', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const seed = await seedAccount(testApp);
    const triggerFunction = `refuse_user_delete_${randomBytes(HEX_BYTES).toString('hex')}`;
    await database.pool.query(
      `CREATE FUNCTION ${triggerFunction}() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'user deletion refused by test'; END
       $$ LANGUAGE plpgsql`,
    );
    await database.pool.query(
      `CREATE TRIGGER ${triggerFunction} BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}()`,
    );
    try {
      const before = await snapshot();

      const response = await deleteWithCookie(testApp, seed.caller.sessionToken);

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
      const after = await snapshot();
      expect(after).toEqual(before);
      expect(before.users).toHaveLength(2);
      expect(before.sessions).toHaveLength(4);
      expect(before.answer_events).toHaveLength(3);
      expect(before.daily_progress).toHaveLength(1);
      expect(before.daily_goal_changes).toHaveLength(1);
      expect(before.one_time_codes).toHaveLength(4);
      expect(before.rate_limit_counters).toHaveLength(5);
      expect(before.entitlements).toHaveLength(1);
      expect(before.purchase_events).toHaveLength(3);
      expect(await payloadOf(seed.eventIds.linked)).toEqual({
        payload: linkedPayload(seed.userId, seed.identity.mixedCaseEmail),
        user_id: seed.userId,
      });
      expect(await payloadOf(seed.eventIds.unlinked)).toEqual({
        payload: unlinkedPayload(seed.userId, seed.identity.mixedCaseEmail),
        user_id: null,
      });
    } finally {
      await database.pool.query(`DROP TRIGGER IF EXISTS ${triggerFunction} ON users`);
      await database.pool.query(`DROP FUNCTION IF EXISTS ${triggerFunction}()`);
    }
  });
});
