// Task 7.6 guards on PUT /v1/me/password (B-79 and B-83 at this route, B-80, B-81): malformed and
// oversized bodies, sessions that are missing, revoked, idle, or another user's, the global CSRF
// guard and JSON-only rule, the per-user hourly limit, the hash slots (busy, no pooled client
// held while waiting, no transaction open across a long slot wait or a derivation), and logs
// that never carry a password, its SHA-1, its prefix, or a stored hash. Every password is built
// at run time.
import { createHash, randomBytes, scrypt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createFakePasswordBreachClient } from '../../clients/fakePasswordBreachClient.js';
import { createLogger } from '../../clients/logger.js';
import type { DeriveKey } from '../../services/passwordHash.js';
import { hashPassword, verifyPassword } from '../../services/passwordHash.js';
import { createPasswordHashSlots } from '../../services/passwordHashSlots.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const PASSWORD_ROUTE = '/v1/me/password';
const ME_ROUTE = '/v1/me';
const READY_ROUTE = '/health/ready';
const COOKIE_NAME = 'syntactical_session';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const LONG_TEST_TIMEOUT_MS = 60_000;
const RESPONSE_DEADLINE_MS = 1_500;
const DEADLINE_PASSED = 'deadline passed';
const DAY_MS = 86_400_000;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const PREFIX_LENGTH = 5;
const MIN_PREFIX_LETTERS = 3;
const BREACH_COUNT = 3;
const ONE_SLOT = 1;
// The spec's numbers, written out so the test does not borrow the code's constants: the raw cap
// (512 UTF-16 units), the lengths (12 to 128), the per-user change limit (10 an hour), and the
// 5-second slot queue timeout.
const RAW_MAX_LENGTH = 512;
const TOO_SHORT_LENGTH = 11;
const TOO_LONG_LENGTH = 129;
const CHANGES_PER_USER = 10;
const QUEUE_TIMEOUT_MS = 5_000;
// A slot wait just under the queue timeout, and an idle-in-transaction timeout far shorter than
// it (and than a slowed derivation), so a transaction left open across either is terminated.
const NEAR_CAP_WAIT_MS = 4_500;
const SHORT_IDLE_IN_TRANSACTION_MS = 2_000;
const SLOWED_DERIVATION_MS = 2_500;
const LONE_HIGH_SURROGATE = String.fromCharCode(0xd800);
const LONE_LOW_SURROGATE = String.fromCharCode(0xdc00);

const realDeriveKey = promisify(scrypt) as DeriveKey;
const answerKey: AnswerKey = new Map();

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

interface PasswordHashSlots {
  run<T>(task: () => Promise<T>): Promise<T>;
}

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function sha1Upper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

// A run-time password whose SHA-1 prefix holds at least 3 of A to F, so a search for the
// uppercase prefix cannot match lowercase hex (uuids, bytea) logged elsewhere.
function buildPassword(): string {
  for (;;) {
    const candidate = randomBytes(PASSWORD_BYTES).toString('hex');
    const letters = sha1Upper(candidate).slice(0, PREFIX_LENGTH).replace(/[0-9]/g, '');
    if (letters.length >= MIN_PREFIX_LETTERS) return candidate;
  }
}

// Hex of exactly `length` UTF-16 units (and code points), built at run time.
function buildHexOfLength(length: number): string {
  return randomBytes(length).toString('hex').slice(0, length);
}

function passwordBody(fields: { current?: unknown; next?: unknown }): Record<string, unknown> {
  const { current, next } = fields;
  return {
    ...(next === undefined ? {} : { newPassword: next }),
    ...(current === undefined ? {} : { currentPassword: current }),
  };
}

function secretForms(value: string): string[] {
  const sha1 = sha1Upper(value);
  return [value, sha1, sha1.toLowerCase(), sha1.slice(0, PREFIX_LENGTH)];
}

function expectNoSecret(texts: string[], value: string): void {
  for (const form of secretForms(value)) {
    for (const text of texts) {
      expect(text).not.toContain(form);
    }
  }
}

function createApp(options: Partial<Parameters<typeof createAuthTestApp>[0]> = {}): TestApp {
  return createAuthTestApp({ answerKey, pool: database.pool, ...options });
}

function putWithBearer({ app }: TestApp, sessionToken: string, body: unknown): Promise<request.Response> {
  return request(app)
    .put(PASSWORD_ROUTE)
    .set('Authorization', `Bearer ${sessionToken}`)
    .send(body as object)
    .then((response) => response);
}

function getMe({ app }: TestApp, sessionToken: string): Promise<request.Response> {
  return request(app)
    .get(ME_ROUTE)
    .set('Authorization', `Bearer ${sessionToken}`)
    .then((response) => response);
}

function errorShape(response: request.Response) {
  const { code } = (response.body.error ?? {}) as { code?: string };
  return { code, status: response.status };
}

function createCountingDeriveKey() {
  const counter = { calls: 0 };
  const deriveKey: DeriveKey = (input, salt, keyBytes, options) => {
    counter.calls += 1;
    return realDeriveKey(input, salt, keyBytes, options);
  };
  return { counter, deriveKey };
}

function createGate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

// Holds the only slot of `slots` until release() is called.
function holdSlot(slots: PasswordHashSlots) {
  const gate = createGate();
  const held = slots.run(() => gate.opened);
  return { held, release: gate.open };
}

// Wraps slots so the test learns when a request first asks for one.
function createSignallingSlots(inner: PasswordHashSlots) {
  const asked = createGate();
  const slots: PasswordHashSlots = {
    run(task) {
      asked.open();
      return inner.run(task);
    },
  };
  return { asked: asked.opened, slots };
}

async function within<T>(pending: PromiseLike<T>, milliseconds: number): Promise<T | typeof DEADLINE_PASSED> {
  const passed = delay(milliseconds).then((): typeof DEADLINE_PASSED => DEADLINE_PASSED);
  return Promise.race([Promise.resolve(pending), passed]);
}

function captureLogs() {
  const lines: string[] = [];
  const logger = createLogger({
    destination: {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
  });
  return { lines, logger };
}

async function insertUser(email: string, passwordHash: string | null = null): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, password_updated_at)
     VALUES ($1, $2::text, CASE WHEN $2::text IS NULL THEN NULL ELSE now() - interval '1 day' END) RETURNING id`,
    [email, passwordHash],
  );
  return rows[0]?.id ?? '';
}

async function readUser(userId: string) {
  const { rows } = await database.pool.query<{ password_hash: string | null; password_updated_at: Date | null }>(
    'SELECT password_hash, password_updated_at FROM users WHERE id = $1',
    [userId],
  );
  return rows[0];
}

async function countRevoked(): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(
    'SELECT count(*) FROM sessions WHERE revoked_at IS NOT NULL',
  );
  return Number(rows[0]?.count);
}

// A user with a known password, a password session to act from, and a second session that a
// password write would revoke.
async function seedPasswordUser(testApp: TestApp) {
  const oldValue = buildPassword();
  const storedHash = await hashPassword(oldValue);
  const userId = await insertUser(buildEmail(), storedHash);
  const now = testApp.clock.now();
  const current = await insertSession(database.pool, { authMethod: 'password', createdAt: now, userId });
  const other = await insertSession(database.pool, { createdAt: now, userId });
  const before = await readUser(userId);
  return { before, current, oldValue, other, storedHash, userId };
}

describe.skipIf(SKIP_DATABASE_TESTS)('PUT /v1/me/password guards', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  describe('negative inputs', () => {
    it(
      'answers each malformed or oversized body with 400 INPUT_INVALID_BODY, deriving nothing, writing nothing, and revoking nothing',
      async () => {
        const { counter, deriveKey } = createCountingDeriveKey();
        const passwordBreachClient = createFakePasswordBreachClient({});
        const testApp = createApp({ deriveKey, passwordBreachClient });
        const bodies: unknown[] = [
          passwordBody({ next: buildHexOfLength(RAW_MAX_LENGTH + 1) }),
          passwordBody({ current: buildHexOfLength(RAW_MAX_LENGTH + 1), next: buildPassword() }),
          passwordBody({ next: buildPassword().concat(LONE_HIGH_SURROGATE) }),
          passwordBody({ next: LONE_LOW_SURROGATE.concat(buildPassword()) }),
          passwordBody({ current: buildPassword().concat(LONE_HIGH_SURROGATE), next: buildPassword() }),
          passwordBody({ current: buildPassword() }),
          passwordBody({ next: Number.parseInt(buildHexOfLength(PASSWORD_BYTES), 16) }),
          passwordBody({ next: null }),
          passwordBody({ next: [buildPassword()] }),
          passwordBody({ next: { value: buildPassword() } }),
          passwordBody({ current: Number.parseInt(buildHexOfLength(PASSWORD_BYTES), 16), next: buildPassword() }),
          passwordBody({ current: null, next: buildPassword() }),
          {},
          [],
        ];

        const outcomes: { response: request.Response; userId: string }[] = [];
        for (const body of bodies) {
          // One user per body, each with a fresh code session, so the per-user limit never applies.
          const userId = await insertUser(buildEmail(), await hashPassword(buildPassword()));
          await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });
          const current = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });
          outcomes.push({ response: await putWithBearer(testApp, current.sessionToken, body), userId });
        }

        for (const { response } of outcomes) {
          expect(errorShape(response)).toEqual({ code: 'INPUT_INVALID_BODY', status: HTTP_BAD_REQUEST });
        }
        expect(counter.calls).toBe(0);
        expect(passwordBreachClient.requestedPrefixes).toEqual([]);
        const { rows } = await database.pool.query<{ count: string }>(
          "SELECT count(*) FROM users WHERE password_updated_at > now() - interval '1 hour'",
        );
        expect(Number(rows[0]?.count)).toBe(0);
        expect(await countRevoked()).toBe(0);
      },
      LONG_TEST_TIMEOUT_MS,
    );

    it(
      'answers a request with no cookie and no bearer token, a revoked session, and an idle-expired session with 401 AUTH_SESSION_REQUIRED, changing nothing',
      async () => {
        const testApp = createApp();
        const { before, current, userId } = await seedPasswordUser(testApp);
        const now = testApp.clock.now();
        const revoked = await insertSession(database.pool, { createdAt: now, revokedAt: now, userId });
        const idle = await insertSession(database.pool, {
          createdAt: new Date(now.getTime() - 20 * DAY_MS),
          lastUsedAt: new Date(now.getTime() - 15 * DAY_MS),
          userId,
        });
        const body = passwordBody({ next: buildPassword() });

        const responses = [
          await request(testApp.app).put(PASSWORD_ROUTE).send(body),
          await putWithBearer(testApp, revoked.sessionToken, body),
          await putWithBearer(testApp, idle.sessionToken, body),
          await request(testApp.app)
            .put(PASSWORD_ROUTE)
            .set('Cookie', `${COOKIE_NAME}=${revoked.sessionToken}`)
            .set('X-Requested-With', 'XMLHttpRequest')
            .send(body),
        ];

        for (const response of responses) {
          expect(errorShape(response)).toEqual({ code: 'AUTH_SESSION_REQUIRED', status: HTTP_UNAUTHORIZED });
        }
        expect(await readUser(userId)).toEqual(before);
        expect((await getMe(testApp, current.sessionToken)).status).toBe(HTTP_OK);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      "changes only the session's own user: another user's session sending this user's current password gets 400 and neither hash changes",
      async () => {
        const testApp = createApp();
        const victim = await seedPasswordUser(testApp);
        const attacker = await seedPasswordUser(testApp);

        const response = await putWithBearer(
          testApp,
          attacker.current.sessionToken,
          passwordBody({ current: victim.oldValue, next: buildPassword() }),
        );

        expect(errorShape(response)).toEqual({ code: 'AUTH_INVALID_CREDENTIALS', status: HTTP_BAD_REQUEST });
        expect(await readUser(victim.userId)).toEqual(victim.before);
        expect(await readUser(attacker.userId)).toEqual(attacker.before);
        expect((await getMe(testApp, victim.other.sessionToken)).status).toBe(HTTP_OK);
        expect(await countRevoked()).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('transport guards', () => {
    it(
      'answers a cookie request without X-Requested-With with 403 CSRF_HEADER_MISSING and changes nothing; with the header it succeeds',
      async () => {
        const testApp = createApp();
        const { before, current, oldValue, userId } = await seedPasswordUser(testApp);
        const body = passwordBody({ current: oldValue, next: buildPassword() });

        const refused = await request(testApp.app)
          .put(PASSWORD_ROUTE)
          .set('Cookie', `${COOKIE_NAME}=${current.sessionToken}`)
          .send(body);
        const afterRefused = await readUser(userId);
        const accepted = await request(testApp.app)
          .put(PASSWORD_ROUTE)
          .set('Cookie', `${COOKIE_NAME}=${current.sessionToken}`)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send(body);

        expect(errorShape(refused)).toEqual({ code: 'CSRF_HEADER_MISSING', status: HTTP_FORBIDDEN });
        expect(afterRefused).toEqual(before);
        expect(accepted.status).toBe(HTTP_OK);
        expect(accepted.body).toEqual({ data: { hasPassword: true } });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers Content-Type text/plain with 415 and changes nothing; the same fields as JSON succeed',
      async () => {
        const testApp = createApp();
        const { before, current, oldValue, userId } = await seedPasswordUser(testApp);
        const body = passwordBody({ current: oldValue, next: buildPassword() });

        const refused = await request(testApp.app)
          .put(PASSWORD_ROUTE)
          .set('Authorization', `Bearer ${current.sessionToken}`)
          .set('Content-Type', 'text/plain')
          .send(JSON.stringify(body));
        const afterRefused = await readUser(userId);
        const accepted = await putWithBearer(testApp, current.sessionToken, body);

        expect(errorShape(refused)).toEqual({
          code: 'INPUT_UNSUPPORTED_MEDIA_TYPE',
          status: HTTP_UNSUPPORTED_MEDIA_TYPE,
        });
        expect(afterRefused).toEqual(before);
        expect(accepted.status).toBe(HTTP_OK);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('per-user rate limit (B-81)', () => {
    it(
      'answers the 11th request for one user in an hour with 429 whatever the first ten returned, leaving other users open',
      async () => {
        const testApp = createApp();
        const { current, oldValue, userId } = await seedPasswordUser(testApp);
        const changedValue = buildPassword();
        const neighbour = await seedPasswordUser(testApp);

        const firstTen = [
          await putWithBearer(testApp, current.sessionToken, passwordBody({ current: oldValue, next: changedValue })),
        ];
        for (let index = 0; index < 3; index += 1) {
          firstTen.push(await putWithBearer(testApp, current.sessionToken, passwordBody({ next: buildPassword() })));
          firstTen.push(await putWithBearer(testApp, current.sessionToken, {}));
          firstTen.push(
            await putWithBearer(
              testApp,
              current.sessionToken,
              passwordBody({ current: changedValue, next: buildHexOfLength(TOO_SHORT_LENGTH) }),
            ),
          );
        }
        const eleventh = await putWithBearer(
          testApp,
          current.sessionToken,
          passwordBody({ current: changedValue, next: buildPassword() }),
        );
        const neighbourResponse = await putWithBearer(
          testApp,
          neighbour.current.sessionToken,
          passwordBody({ current: neighbour.oldValue, next: buildPassword() }),
        );

        expect(firstTen).toHaveLength(CHANGES_PER_USER);
        expect(firstTen.map(({ status }) => status).sort()).toEqual([
          HTTP_OK,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_FORBIDDEN,
          HTTP_FORBIDDEN,
          HTTP_FORBIDDEN,
        ]);
        expect(errorShape(eleventh)).toEqual({ code: 'RATE_LIMIT_EXCEEDED', status: HTTP_TOO_MANY_REQUESTS });
        expect(await verifyPassword(changedValue, String((await readUser(userId))?.password_hash))).toBe(true);
        expect(neighbourResponse.status).toBe(HTTP_OK);
      },
      LONG_TEST_TIMEOUT_MS,
    );
  });

  describe('hash slots (B-79)', () => {
    it(
      'answers 503 SERVER_BUSY when no slot frees within the queue timeout, writing and revoking nothing, then succeeds once it frees',
      async () => {
        const passwordHashSlots = createPasswordHashSlots({ concurrency: ONE_SLOT, queueTimeoutMs: QUEUE_TIMEOUT_MS });
        const testApp = createApp({ passwordHashSlots });
        const { before, current, oldValue, other, userId } = await seedPasswordUser(testApp);
        const newValue = buildPassword();
        const { held, release } = holdSlot(passwordHashSlots);

        let busy: request.Response;
        try {
          busy = await putWithBearer(
            testApp,
            current.sessionToken,
            passwordBody({ current: oldValue, next: newValue }),
          );
        } finally {
          release();
          await held;
        }
        const afterBusy = await readUser(userId);
        const revokedAfterBusy = await countRevoked();
        const otherAfterBusy = await getMe(testApp, other.sessionToken);
        const retried = await putWithBearer(
          testApp,
          current.sessionToken,
          passwordBody({ current: oldValue, next: newValue }),
        );

        expect(errorShape(busy)).toEqual({ code: 'SERVER_BUSY', status: HTTP_SERVICE_UNAVAILABLE });
        expect(afterBusy).toEqual(before);
        expect(revokedAfterBusy).toBe(0);
        expect(otherAfterBusy.status).toBe(HTTP_OK);
        expect(retried.status).toBe(HTTP_OK);
        expect(await verifyPassword(newValue, String((await readUser(userId))?.password_hash))).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'holds no pooled client while waiting for a slot: a pool with max 1 serves /health/ready, then the wait ends in 503',
      async () => {
        const singleClientPool = new pg.Pool({ connectionString: database.databaseUrl, max: 1 });
        const inner = createPasswordHashSlots({ concurrency: ONE_SLOT, queueTimeoutMs: QUEUE_TIMEOUT_MS });
        const { asked, slots } = createSignallingSlots(inner);
        const testApp = createApp({ passwordHashSlots: slots, pool: singleClientPool });
        const { before, current, oldValue, userId } = await seedPasswordUser(testApp);
        const { held, release } = holdSlot(inner);
        try {
          const changing = putWithBearer(
            testApp,
            current.sessionToken,
            passwordBody({ current: oldValue, next: buildPassword() }),
          );
          const hasAsked = await within(asked, RESPONSE_DEADLINE_MS);

          const ready = await within(request(testApp.app).get(READY_ROUTE), RESPONSE_DEADLINE_MS);
          const changed = await within(changing, TEST_TIMEOUT_MS / 2);

          expect(hasAsked).not.toBe(DEADLINE_PASSED);
          expect(ready).not.toBe(DEADLINE_PASSED);
          expect((ready as request.Response).status).toBe(HTTP_OK);
          expect(changed).not.toBe(DEADLINE_PASSED);
          expect(errorShape(changed as request.Response)).toEqual({
            code: 'SERVER_BUSY',
            status: HTTP_SERVICE_UNAVAILABLE,
          });
          expect(await readUser(userId)).toEqual(before);
        } finally {
          release();
          await held;
          await singleClientPool.end();
        }
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'succeeds after a slot wait just under the cap and slowed derivations, on a pool whose idle-in-transaction timeout is shorter than either',
      async () => {
        const shortIdlePool = new pg.Pool({
          connectionString: database.databaseUrl,
          options: `-c idle_in_transaction_session_timeout=${SHORT_IDLE_IN_TRANSACTION_MS}`,
        });
        const inner = createPasswordHashSlots({ concurrency: ONE_SLOT, queueTimeoutMs: QUEUE_TIMEOUT_MS });
        const { asked, slots } = createSignallingSlots(inner);
        const deriveKey: DeriveKey = async (input, salt, keyBytes, options) => {
          await delay(SLOWED_DERIVATION_MS);
          return realDeriveKey(input, salt, keyBytes, options);
        };
        const testApp = createApp({ database: shortIdlePool, deriveKey, passwordHashSlots: slots });
        const { current, oldValue, other, userId } = await seedPasswordUser(testApp);
        const newValue = buildPassword();
        const { held, release } = holdSlot(inner);
        try {
          const { rows } = await shortIdlePool.query<{ setting: string }>(
            "SELECT current_setting('idle_in_transaction_session_timeout') AS setting",
          );
          expect(rows[0]?.setting).toBe(`${SHORT_IDLE_IN_TRANSACTION_MS / 1_000}s`);
          const changing = putWithBearer(
            testApp,
            current.sessionToken,
            passwordBody({ current: oldValue, next: newValue }),
          );
          const hasAsked = await within(asked, RESPONSE_DEADLINE_MS);
          await delay(NEAR_CAP_WAIT_MS);
          release();
          const changed = await within(changing, LONG_TEST_TIMEOUT_MS / 2);

          expect(hasAsked).not.toBe(DEADLINE_PASSED);
          expect(changed).not.toBe(DEADLINE_PASSED);
          expect((changed as request.Response).status).toBe(HTTP_OK);
          expect(await verifyPassword(newValue, String((await readUser(userId))?.password_hash))).toBe(true);
          expect((await getMe(testApp, other.sessionToken)).status).toBe(HTTP_UNAUTHORIZED);
        } finally {
          release();
          await held;
          await shortIdlePool.end();
        }
      },
      LONG_TEST_TIMEOUT_MS,
    );
  });

  describe('logs and responses (B-83)', () => {
    it(
      'keep every run-time password, its SHA-1, its prefix, and the stored hashes out of every log line and response for a 200 and each 4xx',
      async () => {
        const { lines, logger } = captureLogs();
        const breachedValue = buildPassword();
        const breachSha1 = sha1Upper(breachedValue);
        const passwordBreachClient = createFakePasswordBreachClient({
          ranges: { [breachSha1.slice(0, PREFIX_LENGTH)]: `${breachSha1.slice(PREFIX_LENGTH)}:${BREACH_COUNT}` },
        });
        const testApp = createApp({ logger, passwordBreachClient });
        const changer = await seedPasswordUser(testApp);
        const refused = await seedPasswordUser(testApp);
        const codeOnlyId = await insertUser(buildEmail());
        const codeOnly = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId: codeOnlyId });
        const newValue = buildPassword();
        const wrongValue = buildPassword();
        const codeOnlyCurrent = buildPassword();
        const tooShortValue = buildHexOfLength(TOO_SHORT_LENGTH);
        const tooLongValue = buildHexOfLength(TOO_LONG_LENGTH);
        const oversizedValue = buildHexOfLength(RAW_MAX_LENGTH + 1);
        const reauthValue = buildPassword();
        const refusedToken = refused.current.sessionToken;

        const responses = [
          await putWithBearer(
            testApp,
            changer.current.sessionToken,
            passwordBody({ current: changer.oldValue, next: newValue }),
          ),
          await putWithBearer(testApp, refusedToken, passwordBody({ next: reauthValue })),
          await putWithBearer(testApp, refusedToken, passwordBody({ current: wrongValue, next: buildPassword() })),
          await putWithBearer(testApp, refusedToken, passwordBody({ current: refused.oldValue, next: tooShortValue })),
          await putWithBearer(testApp, refusedToken, passwordBody({ current: refused.oldValue, next: tooLongValue })),
          await putWithBearer(testApp, refusedToken, passwordBody({ current: refused.oldValue, next: breachedValue })),
          await putWithBearer(testApp, refusedToken, passwordBody({ current: refused.oldValue, next: oversizedValue })),
          await putWithBearer(
            testApp,
            codeOnly.sessionToken,
            passwordBody({ current: codeOnlyCurrent, next: buildPassword() }),
          ),
        ];

        expect(responses.map(({ status }) => status)).toEqual([
          HTTP_OK,
          HTTP_FORBIDDEN,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
          HTTP_BAD_REQUEST,
        ]);
        expect(lines.length).toBeGreaterThan(0);
        const newHash = String((await readUser(changer.userId))?.password_hash);
        const texts = [...lines, ...responses.map(({ text }) => text)];
        for (const value of [
          changer.oldValue,
          newValue,
          reauthValue,
          wrongValue,
          refused.oldValue,
          tooShortValue,
          tooLongValue,
          breachedValue,
          oversizedValue,
          codeOnlyCurrent,
        ]) {
          expectNoSecret(texts, value);
        }
        for (const text of texts) {
          expect(text).not.toContain(changer.storedHash);
          expect(text).not.toContain(newHash);
          expect(text).not.toContain(refused.storedHash);
          expect(text).not.toContain('$scrypt$');
        }
      },
      LONG_TEST_TIMEOUT_MS,
    );

    it(
      'keep the passwords and stored hash out of every log line and response when the database throws inside the transaction, writing and revoking nothing',
      async () => {
        const { lines, logger } = captureLogs();
        const testApp = createApp({ logger });
        const { before, current, oldValue, other, storedHash, userId } = await seedPasswordUser(testApp);
        const newValue = buildPassword();
        const triggerFunction = `refuse_password_write_${randomBytes(EMAIL_BYTES).toString('hex')}`;
        await database.pool.query(
          `CREATE FUNCTION ${triggerFunction}() RETURNS trigger AS $$
           BEGIN RAISE EXCEPTION 'user update refused by test'; END
           $$ LANGUAGE plpgsql`,
        );
        await database.pool.query(
          `CREATE TRIGGER ${triggerFunction} BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}()`,
        );
        let response: request.Response;
        try {
          response = await putWithBearer(
            testApp,
            current.sessionToken,
            passwordBody({ current: oldValue, next: newValue }),
          );
        } finally {
          await database.pool.query(`DROP TRIGGER IF EXISTS ${triggerFunction} ON users`);
          await database.pool.query(`DROP FUNCTION IF EXISTS ${triggerFunction}()`);
        }

        expect(response.status).toBeGreaterThanOrEqual(HTTP_SERVER_ERROR);
        expect(lines.length).toBeGreaterThan(0);
        const texts = [...lines, response.text];
        expectNoSecret(texts, oldValue);
        expectNoSecret(texts, newValue);
        for (const text of texts) {
          expect(text).not.toContain(storedHash);
          expect(text).not.toContain('$scrypt$');
        }
        expect(await readUser(userId)).toEqual(before);
        expect(await countRevoked()).toBe(0);
        expect((await getMe(testApp, other.sessionToken)).status).toBe(HTTP_OK);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
