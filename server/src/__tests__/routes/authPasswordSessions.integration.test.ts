// Task 7.5 (B-68, B-76, B-79, B-85; B-83 at this route): POST /v1/auth/sessions/password signs an
// existing user in with email and password. It normalizes the password with NFKC, verifies it
// outside any transaction through the hash slots, rehashes a hash made with old parameters, then
// in one short transaction re-checks the stored hash and inserts a session with auth_method
// 'password'. It never creates a user. Every password is built at run time; none is a literal.
import { createHash, randomBytes, scrypt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { Database } from '../../clients/database.js';
import { createLogger } from '../../clients/logger.js';
import { AUTH } from '../../constants/auth.js';
import type { DeriveKey } from '../../services/passwordHash.js';
import { hashPassword, verifyPassword } from '../../services/passwordHash.js';
import { createPasswordHashSlots } from '../../services/passwordHashSlots.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SIGN_IN_ROUTE = '/v1/auth/sessions/password';
const CODES_ROUTE = '/v1/auth/codes';
const SESSIONS_ROUTE = '/v1/auth/sessions';
const SIGNUPS_ROUTE = '/v1/auth/signups';
const VERIFY_ROUTE = '/v1/auth/signups/verify';
const READY_ROUTE = '/health/ready';
const COOKIE_NAME = 'syntactical_session';
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const RESPONSE_DEADLINE_MS = 1_500;
const DEADLINE_PASSED = 'deadline passed';
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const PREFIX_LENGTH = 5;
const MIN_PREFIX_LETTERS = 3;
const RAW_MAX_LENGTH = AUTH.PASSWORD.RAW_MAX_LENGTH;
const CHECKED_LONG_LENGTH = 200;
const ONE_SLOT = 1;
const OLD_LOG_N = 16;
const LIGATURE_FI = String.fromCodePoint(0xfb01);
const LONE_HIGH_SURROGATE = String.fromCharCode(0xd800);
const DECOMPOSED_E_ACUTE = String.fromCodePoint(0x65, 0x301);
const PRECOMPOSED_E_ACUTE = String.fromCodePoint(0xe9);
const TIMEZONE = 'Europe/London';
const OTHER_TIMEZONE = 'Pacific/Auckland';
const NOT_A_TIMEZONE = 'Mars/Olympus_Mons';
const BASE64URL_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CURRENT_HASH_PREFIX = '$scrypt$v=1$ln=17,r=8,p=1$';
const OLD_HASH_PREFIX = '$scrypt$v=1$ln=16,';
const IP_A = '192.0.2.10';

const realDeriveKey = promisify(scrypt) as DeriveKey;

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

function withPassword(value: unknown): Record<'password', unknown> {
  return { password: value };
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

// Wraps slots so the test learns when a request has asked for one.
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

function postSignIn(
  { app }: TestApp,
  body: unknown,
  { ip = IP_A, isNative = false }: { ip?: string; isNative?: boolean } = {},
): Promise<request.Response> {
  const pending = request(app).post(SIGN_IN_ROUTE).set('X-Forwarded-For', ip).set('X-Requested-With', 'XMLHttpRequest');
  return (isNative ? pending.set('X-Client', 'native') : pending).send(body as object).then((response) => response);
}

function sessionCookie(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
}

function cookieValue(cookie: string): string {
  return cookie.slice(COOKIE_NAME.length + 1).split(';')[0] ?? '';
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function errorShape(response: request.Response) {
  const { code, message } = (response.body.error ?? {}) as { code?: string; message?: string };
  return { code, message, status: response.status };
}

async function countRows(table: 'sessions' | 'users'): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
  return Number(rows[0]?.count);
}

async function insertUser(email: string, fields: { passwordHash?: string; timezone?: string } = {}): Promise<string> {
  const { passwordHash = null, timezone = null } = fields;
  const { rows } = await database.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, password_updated_at, timezone)
     VALUES ($1, $2::text, CASE WHEN $2::text IS NULL THEN NULL ELSE now() END, $3) RETURNING id`,
    [email, passwordHash, timezone],
  );
  return rows[0]?.id ?? '';
}

async function readUser(email: string) {
  const { rows } = await database.pool.query<{
    id: string;
    password_hash: string | null;
    timezone: string | null;
  }>('SELECT id, password_hash, timezone FROM users WHERE email = $1', [email]);
  return rows[0];
}

async function readSessions(userId: string) {
  const { rows } = await database.pool.query<{ auth_method: string; token_hash: Buffer }>(
    'SELECT auth_method, token_hash FROM sessions WHERE user_id = $1',
    [userId],
  );
  return rows;
}

async function setStoredHash(userId: string, passwordHash: string): Promise<void> {
  await database.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
}

function hashWithOldParameters(value: string): Promise<string> {
  const { HASH } = AUTH.PASSWORD;
  return hashPassword(value, {
    params: { keyBytes: HASH.KEY_BYTES, logN: OLD_LOG_N, p: HASH.P, r: HASH.R, saltBytes: HASH.SALT_BYTES },
  });
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

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/auth/sessions/password', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  describe('with the right password (B-76)', () => {
    it(
      'answers 201 { data: { userId } } with the session cookie on web, no token, and a password session row',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        const userId = await insertUser(email, { passwordHash: await hashPassword(password) });

        const response = await postSignIn(testApp, { email, password });

        expect(response.status).toBe(HTTP_CREATED);
        expect(response.body).toEqual({ data: { userId } });
        const cookie = sessionCookie(response);
        expect(cookie).toBeDefined();
        const sessions = await readSessions(userId);
        expect(sessions).toHaveLength(1);
        expect(sessions[0]?.auth_method).toBe('password');
        expect(sessions[0]?.token_hash.equals(sha256(cookieValue(cookie ?? '')))).toBe(true);
        expect(await countRows('users')).toBe(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a native client with token in the body and no cookie, stored as a password session',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        const userId = await insertUser(email, { passwordHash: await hashPassword(password) });

        const response = await postSignIn(testApp, { email, password }, { isNative: true });

        expect(response.status).toBe(HTTP_CREATED);
        const data = (response.body.data ?? {}) as Record<string, unknown>;
        expect(Object.keys(data).sort()).toEqual(['token', 'userId']);
        expect(data.userId).toBe(userId);
        expect(String(data.token)).toMatch(BASE64URL_TOKEN);
        expect(sessionCookie(response)).toBeUndefined();
        const sessions = await readSessions(userId);
        expect(sessions.map(({ auth_method: method }) => method)).toEqual(['password']);
        expect(sessions[0]?.token_hash.equals(sha256(String(data.token)))).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'signs in with the email in another case and with surrounding spaces',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        const userId = await insertUser(email, { passwordHash: await hashPassword(password) });

        const response = await postSignIn(testApp, { email: `  ${email.toUpperCase()} `, password });

        expect(response.status).toBe(HTTP_CREATED);
        expect(response.body).toEqual({ data: { userId } });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'stores a valid IANA timezone only when the user has none, keeps an existing one, and ignores an invalid one',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const password = buildPassword();
        const passwordHash = await hashPassword(password);
        const emptyEmail = buildEmail();
        const zonedEmail = buildEmail();
        const invalidEmail = buildEmail();
        await insertUser(emptyEmail, { passwordHash });
        await insertUser(zonedEmail, { passwordHash, timezone: OTHER_TIMEZONE });
        await insertUser(invalidEmail, { passwordHash });

        const responses = [
          await postSignIn(testApp, { email: emptyEmail, password, timezone: TIMEZONE }),
          await postSignIn(testApp, { email: zonedEmail, password, timezone: TIMEZONE }),
          await postSignIn(testApp, { email: invalidEmail, password, timezone: NOT_A_TIMEZONE }),
        ];

        expect(responses.map(({ status }) => status)).toEqual([HTTP_CREATED, HTTP_CREATED, HTTP_CREATED]);
        expect((await readUser(emptyEmail))?.timezone).toBe(TIMEZONE);
        expect((await readUser(zonedEmail))?.timezone).toBe(OTHER_TIMEZONE);
        expect((await readUser(invalidEmail))?.timezone).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'keeps a current-parameter hash byte for byte and runs exactly one derivation',
      async () => {
        const { counter, deriveKey } = createCountingDeriveKey();
        const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        const storedHash = await hashPassword(password);
        await insertUser(email, { passwordHash: storedHash });

        const response = await postSignIn(testApp, { email, password });

        expect(response.status).toBe(HTTP_CREATED);
        expect(counter.calls).toBe(1);
        expect((await readUser(email))?.password_hash).toBe(storedHash);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'never sends a stored hash in a response body or header',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        const storedHash = await hashPassword(password);
        await insertUser(email, { passwordHash: storedHash });

        const web = await postSignIn(testApp, { email, password });
        const native = await postSignIn(testApp, { email, password }, { isNative: true });

        expect([web.status, native.status]).toEqual([HTTP_CREATED, HTTP_CREATED]);
        for (const response of [web, native]) {
          expect(response.text).not.toContain(storedHash);
          expect(response.text).not.toContain('$scrypt$');
          expect(JSON.stringify(response.headers)).not.toContain('$scrypt$');
        }
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('rehash (B-68)', () => {
    it(
      'rewrites an ln=16 hash at the current parameters, and the new hash still verifies',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        const oldHash = await hashWithOldParameters(password);
        expect(oldHash.startsWith(OLD_HASH_PREFIX)).toBe(true);
        await insertUser(email, { passwordHash: oldHash });

        const response = await postSignIn(testApp, { email, password });

        expect(response.status).toBe(HTTP_CREATED);
        const stored = String((await readUser(email))?.password_hash);
        expect(stored).not.toBe(oldHash);
        expect(stored.startsWith(CURRENT_HASH_PREFIX)).toBe(true);
        expect(await verifyPassword(password, stored)).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'never overwrites a hash that changed while the rehash was derived: the newer hash survives',
      async () => {
        const email = buildEmail();
        const password = buildPassword();
        const oldHash = await hashWithOldParameters(password);
        const userId = await insertUser(email, { passwordHash: oldHash });
        const newerHash = await hashPassword(buildPassword());
        let calls = 0;
        // The second derivation is the rehash; a password change lands while it runs.
        const deriveKey: DeriveKey = async (input, salt, keyBytes, options) => {
          calls += 1;
          const derived = await realDeriveKey(input, salt, keyBytes, options);
          if (calls === 2) await setStoredHash(userId, newerHash);
          return derived;
        };
        const testApp = createAuthTestApp({ deriveKey, pool: database.pool });

        const response = await postSignIn(testApp, { email, password });

        expect(calls).toBe(2);
        expect((await readUser(email))?.password_hash).toBe(newerHash);
        expect(errorShape(response)).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', status: HTTP_BAD_REQUEST });
        expect(await readSessions(userId)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('a stored hash that changes between the derivation and the transaction', () => {
    it(
      'answers 400 AUTH_INVALID_CREDENTIALS, creates no session, and leaves the newer hash',
      async () => {
        const email = buildEmail();
        const password = buildPassword();
        const userId = await insertUser(email, { passwordHash: await hashPassword(password) });
        const newerHash = await hashPassword(buildPassword());
        const deriveKey: DeriveKey = async (input, salt, keyBytes, options) => {
          const derived = await realDeriveKey(input, salt, keyBytes, options);
          await setStoredHash(userId, newerHash);
          return derived;
        };
        const testApp = createAuthTestApp({ deriveKey, pool: database.pool });

        const response = await postSignIn(testApp, { email, password });

        expect(errorShape(response)).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', status: HTTP_BAD_REQUEST });
        expect(sessionCookie(response)).toBeUndefined();
        expect(await readSessions(userId)).toEqual([]);
        expect((await readUser(email))?.password_hash).toBe(newerHash);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('NFKC normalization (B-76)', () => {
    it(
      'signs in with a precomposed U+00E9 when the password was set with e plus U+0301',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const stem = randomBytes(PASSWORD_BYTES).toString('hex');
        const decomposed = stem.concat(DECOMPOSED_E_ACUTE);
        const precomposed = stem.concat(PRECOMPOSED_E_ACUTE);
        expect(decomposed).not.toBe(precomposed);
        expect(decomposed.normalize('NFKC')).toBe(precomposed.normalize('NFKC'));
        const userId = await insertUser(email, { passwordHash: await hashPassword(decomposed.normalize('NFKC')) });

        const response = await postSignIn(testApp, { email, ...withPassword(precomposed) });

        expect(response.status).toBe(HTTP_CREATED);
        expect(response.body).toEqual({ data: { userId } });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'signs in an account created through signups/verify with U+FB01 using the two letters fi',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const stem = randomBytes(PASSWORD_BYTES).toString('hex');
        const ligatured = stem.concat(LIGATURE_FI);
        const spelled = stem.concat('f', 'i');
        expect(ligatured.normalize('NFKC')).toBe(spelled);

        const started = await request(testApp.app)
          .post(SIGNUPS_ROUTE)
          .send({ email, ...withPassword(ligatured) });
        expect(started.status).toBe(HTTP_ACCEPTED);
        const { code } = testApp.sentCodes[testApp.sentCodes.length - 1] ?? { code: '' };
        const verified = await request(testApp.app)
          .post(VERIFY_ROUTE)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ code, email, ...withPassword(ligatured) });
        expect(verified.status).toBe(HTTP_CREATED);
        const { userId } = verified.body.data as { userId: string };

        const response = await postSignIn(testApp, { email, ...withPassword(spelled) });

        expect(response.status).toBe(HTTP_CREATED);
        expect(response.body).toEqual({ data: { userId } });
        const methods = (await readSessions(userId)).map(({ auth_method: method }) => method).sort();
        expect(methods).toEqual(['code', 'password']);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('code sign-in to an account with a password (B-85)', () => {
    it(
      'leaves the hash unchanged and records the session as a code session',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const storedHash = await hashPassword(buildPassword());
        const userId = await insertUser(email, { passwordHash: storedHash });
        const issued = await request(testApp.app).post(CODES_ROUTE).send({ email });
        expect(issued.status).toBe(HTTP_ACCEPTED);
        const { code } = testApp.sentCodes[testApp.sentCodes.length - 1] ?? { code: '' };

        const response = await request(testApp.app)
          .post(SESSIONS_ROUTE)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ code, email });

        expect(response.status).toBe(HTTP_CREATED);
        expect((await readUser(email))?.password_hash).toBe(storedHash);
        expect((await readSessions(userId)).map(({ auth_method: method }) => method)).toEqual(['code']);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('negative inputs', () => {
    it(
      'answers each malformed body with 400 INPUT_INVALID_BODY, no derivation, and no session',
      async () => {
        const { counter, deriveKey } = createCountingDeriveKey();
        const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
        const email = buildEmail();
        await insertUser(email, { passwordHash: await hashPassword(buildPassword()) });
        const bodies: unknown[] = [
          { email, ...withPassword(buildHexOfLength(RAW_MAX_LENGTH + 1)) },
          { email, ...withPassword(buildPassword().concat(LONE_HIGH_SURROGATE)) },
          { email, ...withPassword(LONE_HIGH_SURROGATE.concat(buildPassword())) },
          { email },
          { ...withPassword(buildPassword()) },
          { email: 'not-an-email', ...withPassword(buildPassword()) },
          { email: `${'a'.repeat(RAW_MAX_LENGTH)}@example.com`, ...withPassword(buildPassword()) },
          { email, ...withPassword(Number.parseInt(buildHexOfLength(PASSWORD_BYTES), 16)) },
          { email, ...withPassword(null) },
          { email: [email], ...withPassword(buildPassword()) },
          {},
          [],
        ];

        const responses: request.Response[] = [];
        for (const [index, body] of bodies.entries()) {
          responses.push(await postSignIn(testApp, body, { ip: `198.51.100.${index + 1}` }));
        }

        for (const response of responses) {
          expect(errorShape(response)).toMatchObject({ code: 'INPUT_INVALID_BODY', status: HTTP_BAD_REQUEST });
          expect(sessionCookie(response)).toBeUndefined();
        }
        expect(counter.calls).toBe(0);
        expect(await countRows('sessions')).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a 200-code-point password with the ordinary AUTH_INVALID_CREDENTIALS 400 after exactly one derivation',
      async () => {
        const { counter, deriveKey } = createCountingDeriveKey();
        const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
        const email = buildEmail();
        await insertUser(email, { passwordHash: await hashPassword(buildPassword()) });
        const wrong = await postSignIn(testApp, { email, ...withPassword(buildPassword()) });
        counter.calls = 0;

        const response = await postSignIn(testApp, {
          email,
          ...withPassword(buildHexOfLength(CHECKED_LONG_LENGTH)),
        });

        expect(errorShape(response)).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', status: HTTP_BAD_REQUEST });
        expect(errorShape(response)).toEqual(errorShape(wrong));
        expect(counter.calls).toBe(1);
        expect(await countRows('sessions')).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('hash slots (B-79)', () => {
    it(
      'answers 503 SERVER_BUSY when no slot frees within the queue timeout, creating no session, then succeeds once it frees',
      async () => {
        const passwordHashSlots = createPasswordHashSlots({
          concurrency: ONE_SLOT,
          queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS,
        });
        const testApp = createAuthTestApp({ passwordHashSlots, pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        const userId = await insertUser(email, { passwordHash: await hashPassword(password) });
        const { held, release } = holdSlot(passwordHashSlots);

        let busy: request.Response;
        try {
          busy = await postSignIn(testApp, { email, password });
        } finally {
          release();
          await held;
        }
        const sessionsAfterBusy = await readSessions(userId);
        const retried = await postSignIn(testApp, { email, password });

        expect(errorShape(busy)).toMatchObject({ code: 'SERVER_BUSY', status: HTTP_SERVICE_UNAVAILABLE });
        expect(sessionCookie(busy)).toBeUndefined();
        expect(sessionsAfterBusy).toEqual([]);
        expect(retried.status).toBe(HTTP_CREATED);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'holds no pooled client while waiting for a slot: a pool with max 1 serves /health/ready, then the wait ends in 503',
      async () => {
        const singleClientPool = new pg.Pool({ connectionString: database.databaseUrl, max: 1 });
        const inner = createPasswordHashSlots({
          concurrency: ONE_SLOT,
          queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS,
        });
        const { asked, slots } = createSignallingSlots(inner);
        const testApp = createAuthTestApp({ passwordHashSlots: slots, pool: singleClientPool });
        const email = buildEmail();
        const password = buildPassword();
        await insertUser(email, { passwordHash: await hashPassword(password) });
        const { held, release } = holdSlot(inner);
        try {
          const signingIn = postSignIn(testApp, { email, password });
          const hasAsked = await within(asked, RESPONSE_DEADLINE_MS);

          const ready = await within(request(testApp.app).get(READY_ROUTE), RESPONSE_DEADLINE_MS);
          const signedIn = await within(signingIn, TEST_TIMEOUT_MS / 2);

          expect(hasAsked).not.toBe(DEADLINE_PASSED);
          expect(ready).not.toBe(DEADLINE_PASSED);
          expect((ready as request.Response).status).toBe(HTTP_OK);
          expect(signedIn).not.toBe(DEADLINE_PASSED);
          expect(errorShape(signedIn as request.Response)).toMatchObject({
            code: 'SERVER_BUSY',
            status: HTTP_SERVICE_UNAVAILABLE,
          });
        } finally {
          release();
          await held;
          await singleClientPool.end();
        }
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'holds no pooled client and no user row lock while deriving',
      async () => {
        const singleClientPool = new pg.Pool({ connectionString: database.databaseUrl, max: 1 });
        const started = createGate();
        const finish = createGate();
        const deriveKey: DeriveKey = async (input, salt, keyBytes, options) => {
          started.open();
          await finish.opened;
          return realDeriveKey(input, salt, keyBytes, options);
        };
        const testApp = createAuthTestApp({ deriveKey, pool: singleClientPool });
        const email = buildEmail();
        const password = buildPassword();
        const userId = await insertUser(email, { passwordHash: await hashPassword(password) });
        const probe = await database.pool.connect();
        try {
          const signingIn = postSignIn(testApp, { email, password });
          const hasStarted = await within(started.opened, RESPONSE_DEADLINE_MS);

          const ready = await within(request(testApp.app).get(READY_ROUTE), RESPONSE_DEADLINE_MS);
          await probe.query('BEGIN');
          const locked = await probe.query('SELECT id FROM users WHERE id = $1 FOR UPDATE NOWAIT', [userId]);
          await probe.query('ROLLBACK');
          finish.open();
          const signedIn = await within(signingIn, TEST_TIMEOUT_MS / 2);

          expect(hasStarted).not.toBe(DEADLINE_PASSED);
          expect(ready).not.toBe(DEADLINE_PASSED);
          expect((ready as request.Response).status).toBe(HTTP_OK);
          expect(locked.rowCount).toBe(1);
          expect((signedIn as request.Response).status).toBe(HTTP_CREATED);
        } finally {
          finish.open();
          probe.release();
          await singleClientPool.end();
        }
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('logs and responses (B-83)', () => {
    it(
      'keep the password, its SHA-1, its prefix, and the stored hash out of every log line and response on success and failure',
      async () => {
        const { lines, logger } = captureLogs();
        const testApp = createAuthTestApp({ logger, pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        const wrongValue = buildPassword();
        const unknownValue = buildPassword();
        const storedHash = await hashPassword(password);
        await insertUser(email, { passwordHash: storedHash });

        const responses = [
          await postSignIn(testApp, { email, password }),
          await postSignIn(testApp, { email, ...withPassword(wrongValue) }),
          await postSignIn(testApp, { email: buildEmail(), ...withPassword(unknownValue) }),
        ];

        expect(responses.map(({ status }) => status)).toEqual([HTTP_CREATED, HTTP_BAD_REQUEST, HTTP_BAD_REQUEST]);
        expect(lines.length).toBeGreaterThan(0);
        const texts = [...lines, ...responses.map(({ text }) => text)];
        expectNoSecret(texts, password);
        expectNoSecret(texts, wrongValue);
        expectNoSecret(texts, unknownValue);
        for (const text of texts) {
          expect(text).not.toContain(storedHash);
        }
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'keep the password and stored hash out of every log line and response when the database throws',
      async () => {
        const { lines, logger } = captureLogs();
        const failure = Object.assign(new Error('Connection terminated unexpectedly'), { code: '57P01' });
        const failingReads: Database = {
          connect: database.pool.connect.bind(database.pool) as Database['connect'],
          query: (() => Promise.reject(failure)) as Database['query'],
        };
        const failingTransactions: Database = {
          connect: (() => Promise.reject(failure)) as Database['connect'],
          query: database.pool.query.bind(database.pool) as Database['query'],
        };
        const readFailingApp = createAuthTestApp({ database: failingReads, logger, pool: database.pool });
        const transactionFailingApp = createAuthTestApp({
          database: failingTransactions,
          logger,
          pool: database.pool,
        });
        const email = buildEmail();
        const password = buildPassword();
        const storedHash = await hashPassword(password);
        await insertUser(email, { passwordHash: storedHash });

        const readFailed = await postSignIn(readFailingApp, { email, password });
        const transactionFailed = await postSignIn(transactionFailingApp, { email, password });

        expect(readFailed.status).toBeGreaterThanOrEqual(HTTP_SERVER_ERROR);
        expect(transactionFailed.status).toBeGreaterThanOrEqual(HTTP_SERVER_ERROR);
        expect(lines.length).toBeGreaterThan(0);
        const texts = [...lines, readFailed.text, transactionFailed.text];
        expectNoSecret(texts, password);
        for (const text of texts) {
          expect(text).not.toContain(storedHash);
        }
        expect(await countRows('sessions')).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
