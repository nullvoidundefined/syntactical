// B-59.12: DELETE /v1/me is rate limited through createRateLimit, per client IP (5 an hour,
// scope `account-delete:ip`, keyed like the auth routes' IP limits) and per user (3 an hour,
// scope `account-delete:user`, keyed by the session's user id). Over a limit the answer is 429
// RATE_LIMIT_EXCEEDED and nothing is deleted: the user, sessions, codes, and purchase payloads
// are unchanged. A new window allows again. A successful deletion also removes the user's own
// `account-delete:user` counter rows, and leaves other users' rows.
import { createHash, randomBytes } from "node:crypto";

import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { AUTH } from "../../constants/auth.js";
import { rateLimitKey } from "../../services/rateLimitKey.js";
import { createAuthTestApp } from "../integration/createAuthTestApp.js";
import { createMigratedDatabase } from "../integration/createMigratedDatabase.js";
import { insertSession } from "../integration/insertSession.js";

const SKIP_DATABASE_TESTS =
  process.env.SKIP_DOCKER_TESTS === "1" && !process.env.TEST_DATABASE_URL;

const DELETE_ME_ROUTE = "/v1/me";
const HTTP_NO_CONTENT = 204;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED";
const USER_SCOPE = "account-delete:user";
const IP_LIMIT = 5;
const USER_LIMIT = 3;
const WINDOW_MS = AUTH.RATE_LIMIT.WINDOW_MS;
const CODE_TTL_MS = AUTH.CODE.TTL_MS;
const SETUP_TIMEOUT_MS = 120_000;
const HEX_BYTES = 6;
const CODE_SEED_BYTES = 16;
const PRODUCT_ID = "bank-advanced";
const UPDATED_AT_MS = 1_790_000_000_000;
const CALLER_IP = "198.51.100.7";
const OTHER_IP = "203.0.113.9";

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

interface Account {
  email: string;
  eventId: string;
  sessionToken: string;
  userId: string;
}

interface AccountState {
  codeCount: number;
  payloadText: string | null;
  sessionIds: string[];
  userEmail: string | null;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomBytes(HEX_BYTES).toString("hex")}@example.com`;
}

function ipNumber(index: number): string {
  return `192.0.2.${index + 1}`;
}

function windowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
}

function codeHash(): Buffer {
  return createHash("sha256").update(randomBytes(CODE_SEED_BYTES)).digest();
}

// A user with two sessions (the caller's and another device's), a live one-time code, and a
// linked purchase event whose payload carries the email and the user id.
async function seedAccount(testApp: TestApp, prefix: string): Promise<Account> {
  const now = testApp.clock.now();
  const email = uniqueEmail(prefix);
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id",
    [email, "Europe/London"],
  );
  const [{ id: userId }] = rows;
  const caller = await insertSession(database.pool, { createdAt: now, userId });
  await insertSession(database.pool, { createdAt: now, userId });
  await database.pool.query(
    `INSERT INTO one_time_codes (email, code_hash, created_at, expires_at, used_at, invalidated_at)
     VALUES ($1, $2, $3, $4, NULL, NULL)`,
    [email, codeHash(), now, new Date(now.getTime() + CODE_TTL_MS)],
  );
  const eventId = `evt-${randomBytes(HEX_BYTES).toString("hex")}`;
  const payload = {
    event: {
      app_user_id: userId,
      product_id: PRODUCT_ID,
      subscriber_attributes: {
        $email: { updated_at_ms: UPDATED_AT_MS, value: email },
      },
      type: "INITIAL_PURCHASE",
    },
  };
  await database.pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     VALUES ('revenuecat', $1, 'purchase', $2, $3, $4, $5)`,
    [eventId, now, JSON.stringify(payload), PRODUCT_ID, userId],
  );
  return { email, eventId, sessionToken: caller.sessionToken, userId };
}

async function stateOf(account: Account): Promise<AccountState> {
  const users = await database.pool.query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [account.userId],
  );
  const sessions = await database.pool.query<{ id: string }>(
    "SELECT id FROM sessions WHERE user_id = $1 ORDER BY id",
    [account.userId],
  );
  const codes = await database.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM one_time_codes WHERE email = $1",
    [account.email],
  );
  const events = await database.pool.query<{ payloadText: string }>(
    'SELECT payload::text AS "payloadText" FROM purchase_events WHERE provider_event_id = $1',
    [account.eventId],
  );
  return {
    codeCount: codes.rows[0]?.count ?? 0,
    payloadText: events.rows[0]?.payloadText ?? null,
    sessionIds: sessions.rows.map(({ id }) => id),
    userEmail: users.rows[0]?.email ?? null,
  };
}

async function seedUserCounter(
  testApp: TestApp,
  userId: string,
  count: number,
): Promise<void> {
  const key = rateLimitKey(testApp.rateLimitKeySecret, USER_SCOPE, userId);
  await database.pool.query(
    "INSERT INTO rate_limit_counters (key, window_start, count) VALUES ($1, $2, $3)",
    [key, windowStart(testApp.clock.now()), count],
  );
}

async function userCounterRowCount(
  testApp: TestApp,
  userId: string,
): Promise<number> {
  const key = rateLimitKey(testApp.rateLimitKeySecret, USER_SCOPE, userId);
  const { rows } = await database.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM rate_limit_counters WHERE key = $1",
    [key],
  );
  return rows[0]?.count ?? 0;
}

function deleteFrom({ app }: TestApp, sessionToken: string, ip: string) {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set("Authorization", `Bearer ${sessionToken}`)
    .set("X-Forwarded-For", ip);
}

function expectRateLimited(response: request.Response): void {
  expect(response.status).toBe(HTTP_TOO_MANY_REQUESTS);
  const { code } = response.body.error as { code: string };
  expect(code).toBe(RATE_LIMIT_EXCEEDED);
}

describe.skipIf(SKIP_DATABASE_TESTS)(
  "DELETE /v1/me rate limits (B-59.12)",
  () => {
    beforeAll(async () => {
      database = await createMigratedDatabase(inject("testDatabaseUrl"));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
      await database?.drop();
    });

    beforeEach(async () => {
      await database.reset();
    });

    it("answers the 6th deletion from one IP in the hour with 429 and deletes nothing; another IP still may", async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      for (let index = 0; index < IP_LIMIT; index += 1) {
        const account = await seedAccount(testApp, `learner-ip-${index}`);
        expect(
          (await deleteFrom(testApp, account.sessionToken, CALLER_IP)).status,
        ).toBe(HTTP_NO_CONTENT);
      }
      const sixth = await seedAccount(testApp, "learner-sixth");
      const before = await stateOf(sixth);

      const limited = await deleteFrom(testApp, sixth.sessionToken, CALLER_IP);

      expectRateLimited(limited);
      const after = await stateOf(sixth);
      expect(after).toEqual(before);
      expect(after.userEmail).toBe(sixth.email);
      expect(after.sessionIds).toHaveLength(2);
      expect(after.codeCount).toBe(1);
      expect(after.payloadText).toContain(sixth.email);

      const fromOtherIp = await deleteFrom(
        testApp,
        sixth.sessionToken,
        OTHER_IP,
      );
      expect(fromOtherIp.status).toBe(HTTP_NO_CONTENT);
      expect((await stateOf(sixth)).userEmail).toBeNull();
    });

    it("allows deletions from the limited IP again in the next window", async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      for (let index = 0; index < IP_LIMIT; index += 1) {
        const account = await seedAccount(testApp, `learner-ip-${index}`);
        expect(
          (await deleteFrom(testApp, account.sessionToken, CALLER_IP)).status,
        ).toBe(HTTP_NO_CONTENT);
      }
      const next = await seedAccount(testApp, "learner-next");
      expectRateLimited(
        await deleteFrom(testApp, next.sessionToken, CALLER_IP),
      );

      testApp.clock.advance(WINDOW_MS);
      const afterWindow = await deleteFrom(
        testApp,
        next.sessionToken,
        CALLER_IP,
      );

      expect(afterWindow.status).toBe(HTTP_NO_CONTENT);
      expect((await stateOf(next)).userEmail).toBeNull();
    });

    it("answers a user's 4th deletion request within the hour with 429 from any IP and deletes nothing", async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const account = await seedAccount(testApp, "learner-user");
      await seedUserCounter(testApp, account.userId, USER_LIMIT);
      const before = await stateOf(account);

      const limited = await deleteFrom(testApp, account.sessionToken, OTHER_IP);

      expectRateLimited(limited);
      const after = await stateOf(account);
      expect(after).toEqual(before);
      expect(after.userEmail).toBe(account.email);
      expect(after.sessionIds).toHaveLength(2);
      expect(after.codeCount).toBe(1);
      expect(after.payloadText).toContain(account.email);
    });

    it("counts per-user requests that fail later in the chain, so the 4th is 429 even from fresh IPs", async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const account = await seedAccount(testApp, "learner-failing");
      const triggerFunction = `refuse_user_delete_${randomBytes(HEX_BYTES).toString("hex")}`;
      await database.pool.query(
        `CREATE FUNCTION ${triggerFunction}() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'user deletion refused by test'; END
       $$ LANGUAGE plpgsql`,
      );
      await database.pool.query(
        `CREATE TRIGGER ${triggerFunction} BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}()`,
      );
      try {
        for (let index = 0; index < USER_LIMIT; index += 1) {
          const failed = await deleteFrom(
            testApp,
            account.sessionToken,
            ipNumber(index),
          );
          expect(failed.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
        }
      } finally {
        await database.pool.query(
          `DROP TRIGGER IF EXISTS ${triggerFunction} ON users`,
        );
        await database.pool.query(
          `DROP FUNCTION IF EXISTS ${triggerFunction}()`,
        );
      }
      const before = await stateOf(account);

      const limited = await deleteFrom(
        testApp,
        account.sessionToken,
        ipNumber(USER_LIMIT),
      );

      expectRateLimited(limited);
      expect(await stateOf(account)).toEqual(before);
      expect(before.userEmail).toBe(account.email);
    });

    it("allows the user to delete again in the next window", async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const account = await seedAccount(testApp, "learner-window");
      await seedUserCounter(testApp, account.userId, USER_LIMIT);
      expectRateLimited(
        await deleteFrom(testApp, account.sessionToken, OTHER_IP),
      );

      testApp.clock.advance(WINDOW_MS);
      const afterWindow = await deleteFrom(
        testApp,
        account.sessionToken,
        OTHER_IP,
      );

      expect(afterWindow.status).toBe(HTTP_NO_CONTENT);
      expect((await stateOf(account)).userEmail).toBeNull();
    });

    it("removes the deleted user's own account-delete:user counter rows and leaves another user's", async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const account = await seedAccount(testApp, "learner-counter");
      const other = await seedAccount(testApp, "learner-other");
      await seedUserCounter(testApp, account.userId, 1);
      await seedUserCounter(testApp, other.userId, 1);

      const response = await deleteFrom(
        testApp,
        account.sessionToken,
        CALLER_IP,
      );

      expect(response.status).toBe(HTTP_NO_CONTENT);
      expect(await userCounterRowCount(testApp, account.userId)).toBe(0);
      expect(await userCounterRowCount(testApp, other.userId)).toBe(1);
    });
  },
);
