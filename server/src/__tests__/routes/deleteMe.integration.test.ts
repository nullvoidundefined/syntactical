// B-59 (Task 3.21): DELETE /v1/me deletes the caller's account in one transaction against a real
// Postgres. The user, sessions, answer events, progress, and goal changes go; the email's
// one-time codes and email-keyed rate-limit counters go; entitlements and purchase events stay
// with user_id null. Afterwards no public table holds the email or the user id. The route needs
// a session and, for a cookie caller, the CSRF header; it logs one line with the request id only.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createLogger } from '../../clients/logger.js';
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
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETUP_TIMEOUT_MS = 120_000;
const BUSY_TEST_TIMEOUT_MS = 30_000;
const HEX_BYTES = 6;
const CODE_SEED_BYTES = 16;
const EPOCH_EXPIRY = 'expires=thu, 01 jan 1970 00:00:00 gmt';
const PRODUCT_ID = 'bank-advanced';
const OTHER_IP = '203.0.113.9';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

interface Seed {
  email: string;
  mixedCaseEmail: string;
  otherUserId: string;
  sessionToken: string;
  userId: string;
}

function buildEmails(): { email: string; mixedCaseEmail: string } {
  const local = randomBytes(HEX_BYTES).toString('hex');
  return { email: `learner-${local}@example.com`, mixedCaseEmail: `Learner-${local.toUpperCase()}@Example.COM` };
}

async function countWhere(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(sql, params);
  return Number(rows[0].count);
}

async function insertUser(email: string): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    email,
  ]);
  return rows[0].id;
}

async function insertCode(email: string, now: Date): Promise<void> {
  await database.pool.query(
    'INSERT INTO one_time_codes (email, code_hash, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [email, createHash('sha256').update(randomBytes(CODE_SEED_BYTES)).digest(), now, new Date(now.getTime() + AUTH.CODE.TTL_MS)],
  );
}

async function insertCounter(key: string, now: Date, count: number): Promise<void> {
  const windowMs = AUTH.RATE_LIMIT.WINDOW_MS;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  await database.pool.query('INSERT INTO rate_limit_counters (key, window_start, count) VALUES ($1, $2, $3)', [
    key,
    windowStart,
    count,
  ]);
}

// The account to delete, with a row in every table that can hold its identity, plus another
// user whose rows must survive.
async function seedAccount(testApp: TestApp): Promise<Seed> {
  const { clock, rateLimitKeySecret } = testApp;
  const now = clock.now();
  const { email, mixedCaseEmail } = buildEmails();
  const userId = await insertUser(email);
  const otherUserId = await insertUser(buildEmails().email);

  const { sessionToken } = await insertSession(database.pool, { createdAt: now, userId });
  await insertSession(database.pool, { createdAt: now, userId });
  await insertSession(database.pool, { createdAt: now, userId: otherUserId });
  for (const owner of [userId, otherUserId]) {
    await database.pool.query(
      `INSERT INTO answer_events (user_id, event_id, bank_key, question_id, choice_index, is_correct, round_kind, answered_at)
       VALUES ($1, $2, 'core', 'q-1', 0, true, 'bank', $3)`,
      [owner, randomUUID(), now],
    );
  }
  await database.pool.query(
    "INSERT INTO daily_progress (user_id, local_date, xp, is_goal_met) VALUES ($1, '2026-10-01', 30, true)",
    [userId],
  );
  await database.pool.query("INSERT INTO daily_goal_changes (user_id, from_date, goal) VALUES ($1, '2026-09-01', 20)", [
    userId,
  ]);
  await insertCode(email, now);

  const { ISSUE_EMAIL, ISSUE_IP, VERIFY_EMAIL } = AUTH.RATE_LIMIT_SCOPE;
  // At the limit, so a counter left behind would make the re-sign-in a 429.
  await insertCounter(rateLimitKey(rateLimitKeySecret, ISSUE_EMAIL, email), now, AUTH.RATE_LIMIT.ISSUE_PER_EMAIL);
  await insertCounter(rateLimitKey(rateLimitKeySecret, VERIFY_EMAIL, email), now, AUTH.RATE_LIMIT.VERIFY_PER_EMAIL);
  await insertCounter(rateLimitKey(rateLimitKeySecret, ISSUE_IP, OTHER_IP), now, 1);

  await database.pool.query(
    "INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, $2, 'revenuecat', 'granted')",
    [userId, PRODUCT_ID],
  );
  // Shaped like the webhook's allowlisted projection (B-39): scalars only, no email, name, or app_user_id.
  const payload = {
    currency: 'USD',
    event_timestamp_ms: now.getTime(),
    price: 4.99,
    product_id: PRODUCT_ID,
    store: 'APP_STORE',
    transaction_id: `txn-${randomBytes(HEX_BYTES).toString('hex')}`,
    type: 'INITIAL_PURCHASE',
  };
  await database.pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     VALUES ('revenuecat', $1, 'INITIAL_PURCHASE', $2, $3, $4, $5)`,
    [`evt-${randomBytes(HEX_BYTES).toString('hex')}`, now, JSON.stringify(payload), PRODUCT_ID, userId],
  );

  return { email, mixedCaseEmail, otherUserId, sessionToken, userId };
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

function deleteWithCookie({ app }: TestApp, sessionToken: string) {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
    .set('X-Requested-With', 'XMLHttpRequest');
}

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

function expectClearedCookie(response: request.Response): void {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cleared = header?.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  const attributes = String(cleared)
    .split(';')
    .map((part) => part.trim().toLowerCase());
  expect(attributes[0]).toBe(`${COOKIE_NAME}=`);
  expect(attributes).toContain(EPOCH_EXPIRY);
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

  it('erases the account so no table holds the email or id, keeping purchase rows with user_id null', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const seed = await seedAccount(testApp);
    const { email, otherUserId, sessionToken, userId } = seed;

    const response = await deleteWithCookie(testApp, sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(response.text).toBe('');
    expectClearedCookie(response);
    expect(await tablesHolding(email)).toEqual([]);
    expect(await tablesHolding(userId)).toEqual([]);
    const { rows: entitlements } = await database.pool.query('SELECT product_id, user_id FROM entitlements');
    expect(entitlements).toEqual([{ product_id: PRODUCT_ID, user_id: null }]);
    const { rows: purchases } = await database.pool.query('SELECT product_id, user_id FROM purchase_events');
    expect(purchases).toEqual([{ product_id: PRODUCT_ID, user_id: null }]);
    // The other user and the IP-keyed counter are untouched.
    expect(await countWhere('SELECT count(*) FROM sessions WHERE user_id = $1', [otherUserId])).toBe(1);
    expect(await countWhere('SELECT count(*) FROM answer_events WHERE user_id = $1', [otherUserId])).toBe(1);
    expect(await countWhere('SELECT count(*) FROM rate_limit_counters', [])).toBe(1);

    const again = await deleteWithCookie(testApp, sessionToken);
    expect(again.status).toBe(HTTP_UNAUTHORIZED);
  });

  it('deletes a bearer caller, whose token then gets 401, and the email signs in again as a new empty user', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const { email, mixedCaseEmail, sessionToken, userId } = await seedAccount(testApp);

    const response = await deleteWithBearer(testApp, sessionToken);
    const again = await deleteWithBearer(testApp, sessionToken);
    await request(testApp.app).post(CODES_ROUTE).send({ email: mixedCaseEmail });
    const { code } = testApp.sentCodes[testApp.sentCodes.length - 1];
    const signedIn = await request(testApp.app)
      .post(SESSIONS_ROUTE)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('X-Client', 'native')
      .send({ code, email });

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(again.status).toBe(HTTP_UNAUTHORIZED);
    expect(signedIn.status).toBe(HTTP_CREATED);
    const { rows } = await database.pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(userId);
    expect(await countWhere('SELECT count(*) FROM entitlements WHERE user_id = $1', [rows[0].id])).toBe(0);
    expect(await countWhere('SELECT count(*) FROM answer_events WHERE user_id = $1', [rows[0].id])).toBe(0);
  });

  it('answers 401 without a session', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    await seedAccount(testApp);

    const response = await request(testApp.app).delete(DELETE_ME_ROUTE);

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(await countWhere('SELECT count(*) FROM users', [])).toBe(2);
  });

  it('answers 403 to a cookie request without the CSRF header and deletes nothing', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const { sessionToken, userId } = await seedAccount(testApp);

    const response = await request(testApp.app)
      .delete(DELETE_ME_ROUTE)
      .set('Cookie', `${COOKIE_NAME}=${sessionToken}`);

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(1);
  });

  it('answers 204 or 401 to two concurrent deletes for the same user, never an error', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const { sessionToken, userId } = await seedAccount(testApp);

    const responses = await Promise.all([
      deleteWithBearer(testApp, sessionToken),
      deleteWithBearer(testApp, sessionToken),
    ]);

    const statuses = responses.map(({ status }) => status);
    expect(statuses).toContain(HTTP_NO_CONTENT);
    for (const status of statuses) {
      expect([HTTP_NO_CONTENT, HTTP_UNAUTHORIZED]).toContain(status);
    }
    expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(0);
  });

  it('logs one account deleted line carrying the request id and neither the email nor the user id', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      destination: {
        write(chunk: string) {
          lines.push(...chunk.split('\n').filter((line) => line.length > 0));
        },
      },
    });
    const testApp = createAuthTestApp({ logger, pool: database.pool });
    const { email, sessionToken, userId } = await seedAccount(testApp);

    const response = await deleteWithBearer(testApp, sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const deletedLines = lines.filter((line) => (JSON.parse(line) as { msg?: string }).msg === 'account deleted');
    expect(deletedLines).toHaveLength(1);
    const [line] = deletedLines;
    expect((JSON.parse(line) as { requestId?: unknown }).requestId).toEqual(expect.any(String));
    for (const logged of lines) {
      expect(logged.toLowerCase()).not.toContain(email);
      expect(logged).not.toContain(userId);
    }
  });

  it('answers 500 and changes nothing when a statement fails part way through', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const { email, sessionToken, userId } = await seedAccount(testApp);
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
      const response = await deleteWithBearer(testApp, sessionToken);

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
      expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(1);
      expect(await countWhere('SELECT count(*) FROM one_time_codes WHERE email = $1', [email])).toBe(1);
      expect(await countWhere('SELECT count(*) FROM rate_limit_counters', [])).toBe(3);
    } finally {
      await database.pool.query(`DROP TRIGGER IF EXISTS ${triggerFunction} ON users`);
      await database.pool.query(`DROP FUNCTION IF EXISTS ${triggerFunction}()`);
    }
  });

  it('answers 503 SERVER_BUSY at the lock timeout while another connection holds the user row, deleting nothing, then 204 after release', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const { sessionToken, userId } = await seedAccount(testApp);
    const holder = await database.pool.connect();
    let busy: request.Response;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      busy = await deleteWithBearer(testApp, sessionToken);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    expect(busy.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(busy.body.error.code).toBe('SERVER_BUSY');
    expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(1);

    const retry = await deleteWithBearer(testApp, sessionToken);
    expect(retry.status).toBe(HTTP_NO_CONTENT);
    expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(0);
  }, BUSY_TEST_TIMEOUT_MS);
});
