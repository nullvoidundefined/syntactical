// Task 7.4 (B-72, B-73, B-74, B-75, B-83; B-69 and B-79 at these routes): POST /v1/auth/signups
// checks the password and emails a code, storing nothing derived from the password; POST
// /v1/auth/signups/verify checks the code and the password again, creates the user with a hash
// of it (or signs an existing user in and changes nothing), and opens a session with auth_method
// 'code'. Every password is built at run time; none is a literal.
import { createHash, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { Database } from '../../clients/database.js';
import { createFakePasswordBreachClient } from '../../clients/fakePasswordBreachClient.js';
import { createLogger } from '../../clients/logger.js';
import { withTransaction } from '../../clients/withTransaction.js';
import { insertSession } from '../../services/insertSession.js';
import type { DeriveKey } from '../../services/passwordHash.js';
import { hashPassword, verifyPassword } from '../../services/passwordHash.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const CODES_ROUTE = '/v1/auth/codes';
const SESSIONS_ROUTE = '/v1/auth/sessions';
const SIGNUPS_ROUTE = '/v1/auth/signups';
const VERIFY_ROUTE = '/v1/auth/signups/verify';
const COOKIE_NAME = 'syntactical_session';
const HTTP_ACCEPTED = 202;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const CODE_TTL_MS = 600_000;
const MAX_ATTEMPTS = 5;
const ISSUES_PER_EMAIL = 5;
const CODES_BEFORE_SIGNUPS = 3;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const IP_OCTET_LIMIT = 250;
const CODE_SPACE = 1_000_000;
const CODE_DIGITS = 6;
const RAW_MAX_LENGTH = 512;
const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const PREFIX_LENGTH = 5;
const MIN_PREFIX_LETTERS = 3;
const BREACH_COUNT = 3;
const LIGATURE_FI = String.fromCodePoint(0xfb01);
const LONE_HIGH_SURROGATE = String.fromCharCode(0xd800);
const TIMEZONE = 'Europe/London';
const OTHER_TIMEZONE = 'Pacific/Auckland';
const BASE64URL_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SIGN_UP_BODY = JSON.stringify({ data: { status: 'code-sent' } });

const realDeriveKey = promisify(scrypt) as DeriveKey;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function ipNumber(index: number): string {
  return `192.0.2.${(index % IP_OCTET_LIMIT) + 1}`;
}

function sha1Upper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

// A run-time password whose SHA-1 prefix holds at least 3 of A to F, so a search for the
// uppercase prefix cannot match lowercase hex (bytea, uuids) stored or logged elsewhere.
function buildPassword(): string {
  for (;;) {
    const candidate = randomBytes(PASSWORD_BYTES).toString('hex');
    const letters = sha1Upper(candidate).slice(0, PREFIX_LENGTH).replace(/[0-9]/g, '');
    if (letters.length >= MIN_PREFIX_LETTERS) return candidate;
  }
}

// Hex of exactly `length` UTF-16 units, built at run time.
function buildHexOfLength(length: number): string {
  return randomBytes(length).toString('hex').slice(0, length);
}

function buildSurrogatePassword(): string {
  return buildPassword().concat(LONE_HIGH_SURROGATE);
}

function withPassword(value: string): Record<'password', string> {
  return { password: value };
}

// Every form of the password that must never be stored, logged, or returned.
function secretForms(value: string): string[] {
  const sha1 = sha1Upper(value);
  return [value, sha1, sha1.toLowerCase(), sha1.slice(0, PREFIX_LENGTH)];
}

// A breach client whose range for this password lists its suffix with a count above 0.
function createBreachedClientFor(value: string) {
  const sha1 = sha1Upper(value);
  return createFakePasswordBreachClient({
    ranges: { [sha1.slice(0, PREFIX_LENGTH)]: `${sha1.slice(PREFIX_LENGTH)}:${BREACH_COUNT}` },
  });
}

function createCountingDeriveKey() {
  const counter = { calls: 0 };
  const deriveKey: DeriveKey = (input, salt, keyBytes, options) => {
    counter.calls += 1;
    return realDeriveKey(input, salt, keyBytes, options);
  };
  return { counter, deriveKey };
}

function otherCode(code: string, offset = 1): string {
  return String((Number(code) + offset) % CODE_SPACE).padStart(code.length, '0');
}

async function issueCode({ app, sentCodes }: TestApp, email: string, ip = ipNumber(0)): Promise<string> {
  const response = await request(app).post(CODES_ROUTE).set('X-Forwarded-For', ip).send({ email });
  expect(response.status).toBe(HTTP_ACCEPTED);
  const { code } = sentCodes[sentCodes.length - 1];
  return code;
}

function postSignUp({ app }: TestApp, body: Record<string, unknown>, ip = ipNumber(0)) {
  return request(app).post(SIGNUPS_ROUTE).set('X-Forwarded-For', ip).send(body);
}

function postVerify(
  { app }: TestApp,
  body: Record<string, unknown>,
  { ip = ipNumber(1), isNative = false }: { ip?: string; isNative?: boolean } = {},
) {
  const pending = request(app).post(VERIFY_ROUTE).set('X-Forwarded-For', ip).set('X-Requested-With', 'XMLHttpRequest');
  return (isNative ? pending.set('X-Client', 'native') : pending).send(body);
}

function signIn({ app }: TestApp, body: Record<string, unknown>, ip = ipNumber(2)) {
  return request(app)
    .post(SESSIONS_ROUTE)
    .set('X-Forwarded-For', ip)
    .set('X-Requested-With', 'XMLHttpRequest')
    .send(body);
}

function sessionCookie(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
}

function errorShape(response: request.Response) {
  const { code, message } = (response.body.error ?? {}) as { code?: string; message?: string };
  return { code, message, status: response.status };
}

async function countRows(table: 'one_time_codes' | 'sessions' | 'users'): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
  return Number(rows[0]?.count);
}

async function readUser(email: string) {
  const { rows } = await database.pool.query<{
    id: string;
    password_hash: string | null;
    password_updated_at: Date | null;
    timezone: string | null;
  }>('SELECT id, password_hash, password_updated_at, timezone FROM users WHERE email = $1', [email]);
  return rows[0];
}

async function readSessions(userId: string) {
  const { rows } = await database.pool.query<{ auth_method: string; token_hash: Buffer }>(
    'SELECT auth_method, token_hash FROM sessions WHERE user_id = $1',
    [userId],
  );
  return rows;
}

async function readCodes(email: string) {
  const { rows } = await database.pool.query<{ attempts: number; used_at: Date | null }>(
    'SELECT attempts, used_at FROM one_time_codes WHERE email = $1 ORDER BY created_at',
    [email],
  );
  return rows;
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

// Every row of every application table, as JSON text.
async function dumpAllRows(): Promise<string[]> {
  const { rows: tables } = await database.pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const dumped: string[] = [];
  for (const { table_name: tableName } of tables) {
    const { rows } = await database.pool.query<{ row: string }>(
      `SELECT row_to_json(t)::text AS row FROM "${tableName}" t`,
    );
    dumped.push(...rows.map(({ row }) => row));
  }
  return dumped;
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

function expectNoSecret(texts: string[], value: string): void {
  for (const form of secretForms(value)) {
    for (const text of texts) {
      expect(text).not.toContain(form);
    }
  }
}

describe.skipIf(SKIP_DATABASE_TESTS)('sign-up routes', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  describe('POST /v1/auth/signups', () => {
    it('answers 202 code-sent, emails one code, and creates no user', async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const email = buildEmail();

      const response = await postSignUp(testApp, { email, ...withPassword(buildPassword()) });

      expect(response.status).toBe(HTTP_ACCEPTED);
      expect(response.text).toBe(SIGN_UP_BODY);
      expect(testApp.sentCodes.map(({ email: to }) => to)).toEqual([email]);
      expect(testApp.sentCodes[0]?.code).toMatch(/^\d{6}$/);
      expect(await countRows('users')).toBe(0);
      expect((await readCodes(email)).map(({ used_at: usedAt }) => usedAt)).toEqual([null]);
    });

    it('leaves no column of any table holding the password, its SHA-1, or its prefix', async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const password = buildPassword();

      const response = await postSignUp(testApp, { email: buildEmail(), password });

      expect(response.status).toBe(HTTP_ACCEPTED);
      const rows = await dumpAllRows();
      expect(rows.length).toBeGreaterThan(0);
      expectNoSecret(rows, password);
    });

    it('answers a breached password with 400 AUTH_PASSWORD_BREACHED and sends no email', async () => {
      const password = buildPassword();
      const passwordBreachClient = createBreachedClientFor(password);
      const testApp = createAuthTestApp({ passwordBreachClient, pool: database.pool });
      const email = buildEmail();

      const response = await postSignUp(testApp, { email, password });

      expect(errorShape(response)).toMatchObject({ code: 'AUTH_PASSWORD_BREACHED', status: HTTP_BAD_REQUEST });
      expect(passwordBreachClient.requestedPrefixes).toEqual([sha1Upper(password).slice(0, PREFIX_LENGTH)]);
      expect(testApp.sentCodes).toEqual([]);
      expect(await readCodes(email)).toEqual([]);
    });

    it('answers a short password with AUTH_PASSWORD_TOO_SHORT and a long one with AUTH_PASSWORD_TOO_LONG, sending no email', async () => {
      const testApp = createAuthTestApp({ pool: database.pool });

      const shortResponse = await postSignUp(testApp, {
        email: buildEmail(),
        ...withPassword(buildHexOfLength(MIN_LENGTH - 1)),
      });
      const longResponse = await postSignUp(testApp, {
        email: buildEmail(),
        ...withPassword(buildHexOfLength(MAX_LENGTH + 1)),
      });

      expect(errorShape(shortResponse)).toMatchObject({ code: 'AUTH_PASSWORD_TOO_SHORT', status: HTTP_BAD_REQUEST });
      expect(errorShape(longResponse)).toMatchObject({ code: 'AUTH_PASSWORD_TOO_LONG', status: HTTP_BAD_REQUEST });
      expect(testApp.sentCodes).toEqual([]);
      expect(await countRows('one_time_codes')).toBe(0);
    });

    it('answers a 513-unit password with 400 INPUT_INVALID_BODY: no email, no derivation, no row', async () => {
      const { counter, deriveKey } = createCountingDeriveKey();
      const testApp = createAuthTestApp({ deriveKey, pool: database.pool });

      const response = await postSignUp(testApp, {
        email: buildEmail(),
        ...withPassword(buildHexOfLength(RAW_MAX_LENGTH + 1)),
      });

      expect(errorShape(response)).toMatchObject({ code: 'INPUT_INVALID_BODY', status: HTTP_BAD_REQUEST });
      expect(testApp.sentCodes).toEqual([]);
      expect(counter.calls).toBe(0);
      expect(await countRows('one_time_codes')).toBe(0);
      expect(await countRows('users')).toBe(0);
    });

    it.each([
      ['a missing password', (email: string) => ({ email })],
      ['a numeric password', (email: string) => ({ email, password: randomBytes(4).readUInt32BE() })],
      ['a lone surrogate', (email: string) => ({ email, ...withPassword(buildSurrogatePassword()) })],
      ['a malformed email', () => ({ email: 'not-an-email', ...withPassword(buildPassword()) })],
    ])('answers %s with 400 INPUT_INVALID_BODY and sends no email', async (_label, buildBody) => {
      const testApp = createAuthTestApp({ pool: database.pool });

      const response = await postSignUp(testApp, buildBody(buildEmail()));

      expect(errorShape(response)).toMatchObject({ code: 'INPUT_INVALID_BODY', status: HTTP_BAD_REQUEST });
      expect(testApp.sentCodes).toEqual([]);
      expect(await countRows('one_time_codes')).toBe(0);
    });

    it(
      'shares the code-issue counter with POST /v1/auth/codes: the 6th issue for one email in an hour gets 429',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();

        const statuses: number[] = [];
        for (let issue = 0; issue < CODES_BEFORE_SIGNUPS; issue += 1) {
          const response = await request(testApp.app)
            .post(CODES_ROUTE)
            .set('X-Forwarded-For', ipNumber(issue))
            .send({ email });
          statuses.push(response.status);
        }
        for (let issue = CODES_BEFORE_SIGNUPS; issue <= ISSUES_PER_EMAIL; issue += 1) {
          const response = await postSignUp(testApp, { email, ...withPassword(buildPassword()) }, ipNumber(issue));
          statuses.push(response.status);
        }

        expect(statuses).toEqual([
          HTTP_ACCEPTED,
          HTTP_ACCEPTED,
          HTTP_ACCEPTED,
          HTTP_ACCEPTED,
          HTTP_ACCEPTED,
          HTTP_TOO_MANY_REQUESTS,
        ]);
        expect(testApp.sentCodes).toHaveLength(ISSUES_PER_EMAIL);
      },
      TEST_TIMEOUT_MS,
    );

    it('answers 503 SERVER_EMAIL_UNAVAILABLE when the email fails, leaving no code row for the email', async () => {
      const testApp = createAuthTestApp({
        pool: database.pool,
        sendSignInCode: () => Promise.reject(new Error('send failed')),
      });
      const email = buildEmail();

      const response = await postSignUp(testApp, { email, ...withPassword(buildPassword()) });

      expect(errorShape(response)).toMatchObject({
        code: 'SERVER_EMAIL_UNAVAILABLE',
        status: HTTP_SERVICE_UNAVAILABLE,
      });
      expect(await readCodes(email)).toEqual([]);
    });
  });

  describe('POST /v1/auth/signups/verify', () => {
    it(
      'creates the user with a hash of the password and a code session, setting the cookie on web',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const password = buildPassword();
        await postSignUp(testApp, { email, password });
        const { code } = testApp.sentCodes[0] ?? { code: '' };

        const response = await postVerify(testApp, { code, email, password, timezone: TIMEZONE });

        expect(response.status).toBe(HTTP_CREATED);
        const user = await readUser(email);
        expect(user).toBeDefined();
        expect(response.body).toEqual({ data: { isPasswordApplied: true, userId: user?.id } });
        expect(sessionCookie(response)).toBeDefined();
        expect(user?.timezone).toBe(TIMEZONE);
        expect(user?.password_updated_at).toBeInstanceOf(Date);
        expect(await verifyPassword(password, String(user?.password_hash))).toBe(true);
        expect(await verifyPassword(password.concat(' '), String(user?.password_hash))).toBe(false);
        const sessions = await readSessions(String(user?.id));
        expect(sessions.map(({ auth_method: authMethod }) => authMethod)).toEqual(['code']);
        expect((await readCodes(email)).map(({ used_at: usedAt }) => usedAt !== null)).toEqual([true]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'gives a native client the token in the body and sets no cookie',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const code = await issueCode(testApp, email);

        const response = await postVerify(
          testApp,
          { code, email, ...withPassword(buildPassword()) },
          { isNative: true },
        );

        expect(response.status).toBe(HTTP_CREATED);
        expect(response.headers['set-cookie']).toBeUndefined();
        const { data } = response.body as { data: Record<string, unknown> };
        expect(data.isPasswordApplied).toBe(true);
        const nativeToken = String(data.token);
        expect(nativeToken).toMatch(BASE64URL_TOKEN);
        const [session] = await readSessions(String(data.userId));
        expect(session?.token_hash.equals(createHash('sha256').update(nativeToken).digest())).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'signs in a user who already has a password, applies nothing, and keeps the hash byte for byte',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const storedHash = await hashPassword(buildPassword());
        const userId = await insertUser(email, { passwordHash: storedHash, timezone: TIMEZONE });
        const before = await readUser(email);
        const code = await issueCode(testApp, email);

        const response = await postVerify(testApp, {
          code,
          email,
          ...withPassword(buildPassword()),
          timezone: OTHER_TIMEZONE,
        });

        expect(response.status).toBe(HTTP_CREATED);
        expect(response.body).toEqual({ data: { isPasswordApplied: false, userId } });
        const after = await readUser(email);
        expect(after?.password_hash).toBe(storedHash);
        expect(after?.password_updated_at?.getTime()).toBe(before?.password_updated_at?.getTime());
        expect(after?.timezone).toBe(TIMEZONE);
        expect((await readSessions(userId)).map(({ auth_method: authMethod }) => authMethod)).toEqual(['code']);
        expect(await countRows('users')).toBe(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'signs in a code-only user, leaves the hash null, and stores a timezone only when the user has none',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const userId = await insertUser(email);
        const code = await issueCode(testApp, email);

        const response = await postVerify(testApp, {
          code,
          email,
          ...withPassword(buildPassword()),
          timezone: TIMEZONE,
        });

        expect(response.status).toBe(HTTP_CREATED);
        expect(response.body).toEqual({ data: { isPasswordApplied: false, userId } });
        const after = await readUser(email);
        expect(after?.password_hash).toBeNull();
        expect(after?.password_updated_at).toBeNull();
        expect(after?.timezone).toBe(TIMEZONE);
        expect((await readSessions(userId)).map(({ auth_method: authMethod }) => authMethod)).toEqual(['code']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'runs the breach check: the fake records one prefix, and a breached password gets 400 and leaves the code unused',
      async () => {
        const cleanPassword = buildPassword();
        const breachedPassword = buildPassword();
        const passwordBreachClient = createBreachedClientFor(breachedPassword);
        const testApp = createAuthTestApp({ passwordBreachClient, pool: database.pool });
        const cleanEmail = buildEmail();
        const breachedEmail = buildEmail();
        const cleanCode = await issueCode(testApp, cleanEmail);
        const breachedCode = await issueCode(testApp, breachedEmail);

        const clean = await postVerify(testApp, { code: cleanCode, email: cleanEmail, ...withPassword(cleanPassword) });
        const prefixesAfterClean = [...passwordBreachClient.requestedPrefixes];
        const breached = await postVerify(testApp, {
          code: breachedCode,
          email: breachedEmail,
          ...withPassword(breachedPassword),
        });

        expect(clean.status).toBe(HTTP_CREATED);
        expect(prefixesAfterClean).toEqual([sha1Upper(cleanPassword).slice(0, PREFIX_LENGTH)]);
        expect(errorShape(breached)).toMatchObject({ code: 'AUTH_PASSWORD_BREACHED', status: HTTP_BAD_REQUEST });
        expect(await readUser(breachedEmail)).toBeUndefined();
        expect((await readCodes(breachedEmail)).map(({ used_at: usedAt }) => usedAt)).toEqual([null]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers an expired and a reused code with the POST /v1/auth/sessions bad-code body, creating nothing',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const referenceEmail = buildEmail();
        const referenceCode = await issueCode(testApp, referenceEmail);
        const reference = errorShape(await signIn(testApp, { code: otherCode(referenceCode), email: referenceEmail }));
        const reusedEmail = buildEmail();
        const reusedCode = await issueCode(testApp, reusedEmail);
        expect((await signIn(testApp, { code: reusedCode, email: reusedEmail })).status).toBe(HTTP_CREATED);
        const expiredEmail = buildEmail();
        const expiredCode = await issueCode(testApp, expiredEmail);
        testApp.clock.advance(CODE_TTL_MS);
        const usersBefore = await countRows('users');
        const sessionsBefore = await countRows('sessions');

        const responses = [
          await postVerify(testApp, { code: expiredCode, email: expiredEmail, ...withPassword(buildPassword()) }),
          await postVerify(testApp, { code: reusedCode, email: reusedEmail, ...withPassword(buildPassword()) }),
        ];

        expect(reference).toEqual({ code: 'AUTH_INVALID_CODE', message: expect.any(String), status: HTTP_BAD_REQUEST });
        expect(responses.map(errorShape)).toEqual(responses.map(() => reference));
        expect(responses.every((response) => sessionCookie(response) === undefined)).toBe(true);
        expect(await countRows('users')).toBe(usersBefore);
        expect(await countRows('sessions')).toBe(sessionsBefore);
        expect(await readUser(expiredEmail)).toBeUndefined();
        expect((await readUser(reusedEmail))?.password_hash).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a wrong code and an invalidated code with the bad-code body, counting each against the live code',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const referenceEmail = buildEmail();
        const referenceCode = await issueCode(testApp, referenceEmail);
        const reference = errorShape(await signIn(testApp, { code: otherCode(referenceCode), email: referenceEmail }));
        const wrongEmail = buildEmail();
        const wrongCode = otherCode(await issueCode(testApp, wrongEmail));
        const invalidatedEmail = buildEmail();
        const invalidatedCode = await issueCode(testApp, invalidatedEmail);
        const liveCode = await issueCode(testApp, invalidatedEmail);
        const sessionsBefore = await countRows('sessions');

        const responses = [
          await postVerify(testApp, { code: wrongCode, email: wrongEmail, ...withPassword(buildPassword()) }),
          await postVerify(testApp, {
            code: invalidatedCode === liveCode ? otherCode(liveCode) : invalidatedCode,
            email: invalidatedEmail,
            ...withPassword(buildPassword()),
          }),
        ];

        expect(reference).toEqual({ code: 'AUTH_INVALID_CODE', message: expect.any(String), status: HTTP_BAD_REQUEST });
        expect(responses.map(errorShape)).toEqual(responses.map(() => reference));
        expect(await readUser(wrongEmail)).toBeUndefined();
        expect(await readUser(invalidatedEmail)).toBeUndefined();
        expect(await countRows('sessions')).toBe(sessionsBefore);
        expect((await readCodes(wrongEmail)).map(({ attempts }) => attempts)).toEqual([1]);
        // The invalidated code is no longer live; the guess counts against the email's newer, live code.
        expect((await readCodes(invalidatedEmail)).map(({ attempts }) => attempts)).toEqual([0, 1]);
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      ['no code was issued', 'none'],
      ['the only code expired', 'expired'],
      ['the only code was used', 'used'],
      ['the only code is exhausted', 'exhausted'],
    ] as const)(
      'answers the B-27 400 without any derivation when %s',
      async (_label, state) => {
        const { counter, deriveKey } = createCountingDeriveKey();
        const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
        const email = buildEmail();
        let code = String(randomBytes(4).readUInt32BE() % CODE_SPACE).padStart(CODE_DIGITS, '0');
        if (state !== 'none') {
          code = await issueCode(testApp, email);
        }
        if (state === 'expired') {
          testApp.clock.advance(CODE_TTL_MS);
        }
        if (state === 'used') {
          expect((await signIn(testApp, { code, email })).status).toBe(HTTP_CREATED);
        }
        if (state === 'exhausted') {
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
            await signIn(testApp, { code: otherCode(code, attempt), email });
          }
        }
        const usersBefore = await countRows('users');
        counter.calls = 0;

        const response = await postVerify(testApp, { code, email, ...withPassword(buildPassword()) });

        expect(errorShape(response)).toEqual({
          code: 'AUTH_INVALID_CODE',
          message: expect.any(String),
          status: HTTP_BAD_REQUEST,
        });
        expect(counter.calls).toBe(0);
        expect(await countRows('users')).toBe(usersBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a policy-failing password sent with a valid code with the policy error and leaves the code usable',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const code = await issueCode(testApp, email);

        const rejected = await postVerify(testApp, { code, email, ...withPassword(buildHexOfLength(MIN_LENGTH - 1)) });
        const codesAfterRejection = await readCodes(email);
        const accepted = await postVerify(testApp, { code, email, ...withPassword(buildPassword()) });

        expect(errorShape(rejected)).toMatchObject({ code: 'AUTH_PASSWORD_TOO_SHORT', status: HTTP_BAD_REQUEST });
        expect(codesAfterRejection.map(({ attempts, used_at: usedAt }) => ({ attempts, usedAt }))).toEqual([
          { attempts: 0, usedAt: null },
        ]);
        expect(accepted.status).toBe(HTTP_CREATED);
      },
      TEST_TIMEOUT_MS,
    );

    it('answers a 513-unit password with 400 INPUT_INVALID_BODY: no derivation, no row, the code untouched', async () => {
      const { counter, deriveKey } = createCountingDeriveKey();
      const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
      const email = buildEmail();
      const code = await issueCode(testApp, email);

      const response = await postVerify(testApp, {
        code,
        email,
        ...withPassword(buildHexOfLength(RAW_MAX_LENGTH + 1)),
      });

      expect(errorShape(response)).toMatchObject({ code: 'INPUT_INVALID_BODY', status: HTTP_BAD_REQUEST });
      expect(counter.calls).toBe(0);
      expect(testApp.sentCodes).toHaveLength(1);
      expect(await countRows('users')).toBe(0);
      expect(await countRows('sessions')).toBe(0);
      expect((await readCodes(email)).map(({ attempts, used_at: usedAt }) => ({ attempts, usedAt }))).toEqual([
        { attempts: 0, usedAt: null },
      ]);
    });

    it.each([
      [
        'a malformed code',
        (email: string, code: string) => ({ code: code.slice(1), email, ...withPassword(buildPassword()) }),
      ],
      ['a missing password', (email: string, code: string) => ({ code, email })],
      [
        'a lone surrogate',
        (email: string, code: string) => ({ code, email, ...withPassword(buildSurrogatePassword()) }),
      ],
      [
        'a non-string timezone',
        (email: string, code: string) => ({ code, email, ...withPassword(buildPassword()), timezone: 7 }),
      ],
    ])('answers %s with 400 INPUT_INVALID_BODY and no derivation', async (_label, buildBody) => {
      const { counter, deriveKey } = createCountingDeriveKey();
      const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
      const email = buildEmail();
      const code = await issueCode(testApp, email);

      const response = await postVerify(testApp, buildBody(email, code));

      expect(errorShape(response)).toMatchObject({ code: 'INPUT_INVALID_BODY', status: HTTP_BAD_REQUEST });
      expect(counter.calls).toBe(0);
      expect(await countRows('users')).toBe(0);
    });

    it(
      'normalizes with NFKC: a password holding U+FB01 is stored so its two-letter fi form verifies',
      async () => {
        const testApp = createAuthTestApp({ pool: database.pool });
        const email = buildEmail();
        const stem = randomBytes(PASSWORD_BYTES).toString('hex');
        const ligatured = stem.concat(LIGATURE_FI);
        const spelled = ligatured.normalize('NFKC');
        expect(spelled).toBe(stem.concat('f', 'i'));
        const code = await issueCode(testApp, email);

        const response = await postVerify(testApp, { code, email, ...withPassword(ligatured) });

        expect(response.status).toBe(HTTP_CREATED);
        const user = await readUser(email);
        expect(await verifyPassword(spelled, String(user?.password_hash))).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('POST /v1/auth/sessions after the createSession split', () => {
    it('still creates the user on first code sign-in and records the session as a code session', async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const email = buildEmail();
      const code = await issueCode(testApp, email);

      const response = await signIn(testApp, { code, email, timezone: TIMEZONE });

      expect(response.status).toBe(HTTP_CREATED);
      const user = await readUser(email);
      expect(user?.timezone).toBe(TIMEZONE);
      expect(user?.password_hash).toBeNull();
      expect((await readSessions(String(user?.id))).map(({ auth_method: authMethod }) => authMethod)).toEqual(['code']);
    });
  });

  describe('insertSession', () => {
    it.each([['code'], ['password']] as const)(
      "stores a session with auth_method '%s' and the SHA-256 of the token it returns",
      async (authMethod) => {
        const userId = await insertUser(buildEmail());
        const now = new Date();

        const { sessionToken } = await withTransaction(database.pool, (client) =>
          insertSession(client, { authMethod, now, userId }),
        );

        expect(sessionToken).toMatch(BASE64URL_TOKEN);
        const sessions = await readSessions(userId);
        expect(sessions.map(({ auth_method: method }) => method)).toEqual([authMethod]);
        expect(sessions[0]?.token_hash.equals(createHash('sha256').update(sessionToken).digest())).toBe(true);
      },
    );
  });

  describe('logs', () => {
    it(
      'keep the password, its SHA-1, its prefix, and the stored hash out of every log line and response',
      async () => {
        const { lines, logger } = captureLogs();
        const breachedPassword = buildPassword();
        const testApp = createAuthTestApp({
          logger,
          passwordBreachClient: createBreachedClientFor(breachedPassword),
          pool: database.pool,
        });
        const email = buildEmail();
        const password = buildPassword();

        const responses = [
          await postSignUp(testApp, { email, password }),
          await postSignUp(testApp, { email: buildEmail(), ...withPassword(breachedPassword) }),
        ];
        const { code } = testApp.sentCodes[0] ?? { code: '' };
        responses.push(await postVerify(testApp, { code, email, password }));
        const user = await readUser(email);

        expect(responses.map(({ status }) => status)).toEqual([HTTP_ACCEPTED, HTTP_BAD_REQUEST, HTTP_CREATED]);
        expect(lines.length).toBeGreaterThan(0);
        const texts = [...lines, ...responses.map(({ text }) => text)];
        expectNoSecret(texts, password);
        expectNoSecret(texts, breachedPassword);
        const storedHash = String(user?.password_hash);
        for (const text of texts) {
          expect(text).not.toContain(storedHash);
        }
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'keep the password out of every log line and response when the database throws mid-request',
      async () => {
        const { lines, logger } = captureLogs();
        const failure = Object.assign(new Error('Connection terminated unexpectedly'), { code: '57P01' });
        const failingDatabase: Database = {
          connect: (() => Promise.reject(failure)) as Database['connect'],
          query: database.pool.query.bind(database.pool) as Database['query'],
        };
        const healthyApp = createAuthTestApp({ pool: database.pool });
        const failingApp = createAuthTestApp({ database: failingDatabase, logger, pool: database.pool });
        const signUpValue = buildPassword();
        const verifyValue = buildPassword();
        const verifyEmail = buildEmail();
        const code = await issueCode(healthyApp, verifyEmail);

        const signUp = await postSignUp(failingApp, { email: buildEmail(), ...withPassword(signUpValue) });
        const verify = await postVerify(failingApp, { code, email: verifyEmail, ...withPassword(verifyValue) });

        expect(signUp.status).toBeGreaterThanOrEqual(500);
        expect(verify.status).toBeGreaterThanOrEqual(500);
        expect(lines.length).toBeGreaterThan(0);
        const texts = [...lines, signUp.text, verify.text];
        expectNoSecret(texts, signUpValue);
        expectNoSecret(texts, verifyValue);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
