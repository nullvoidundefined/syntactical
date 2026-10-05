// Task 7.6 (B-80, B-81, B-82; B-85 freshness): PUT /v1/me/password sets or changes the signed-in
// user's password. With currentPassword it must verify against the stored hash; without it the
// session must be a fresh code sign-in (a code session at most 10 minutes old; a password session
// never qualifies), else 403 AUTH_REAUTH_REQUIRED. newPassword passes the length policy and the
// breach check. A write stores the hash and password_updated_at and revokes every other session
// of the user; the current session keeps working. Every password is built at run time.
import { createHash, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createFakePasswordBreachClient } from '../../clients/fakePasswordBreachClient.js';
import type { DeriveKey } from '../../services/passwordHash.js';
import { hashPassword, verifyPassword } from '../../services/passwordHash.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const PASSWORD_ROUTE = '/v1/me/password';
const ME_ROUTE = '/v1/me';
const CODES_ROUTE = '/v1/auth/codes';
const SESSIONS_ROUTE = '/v1/auth/sessions';
const PASSWORD_SIGN_IN_ROUTE = '/v1/auth/sessions/password';
const COOKIE_NAME = 'syntactical_session';
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_SERVER_ERROR = 500;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const PREFIX_LENGTH = 5;
const BREACH_COUNT = 3;
// The spec's lengths (decision 28), written out so the test does not borrow the code's constants.
const TOO_SHORT_LENGTH = 11;
const TOO_LONG_LENGTH = 129;
const LIGATURE_FI = String.fromCodePoint(0xfb01);
const CURRENT_HASH_PREFIX = '$scrypt$v=1$ln=17,r=8,p=1$';

const realDeriveKey = promisify(scrypt) as DeriveKey;
const answerKey: AnswerKey = new Map();

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

interface Caller {
  sessionToken: string;
  transport: 'bearer' | 'cookie';
}

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function buildPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString('hex');
}

// Hex of exactly `length` UTF-16 units (and code points), built at run time.
function buildHexOfLength(length: number): string {
  return randomBytes(length).toString('hex').slice(0, length);
}

function sha1Upper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

function passwordBody(fields: { current?: string; next: string }): Record<string, string> {
  const { current, next } = fields;
  return { newPassword: next, ...(current === undefined ? {} : { currentPassword: current }) };
}

function createApp(options: Partial<Parameters<typeof createAuthTestApp>[0]> = {}): TestApp {
  return createAuthTestApp({ answerKey, pool: database.pool, ...options });
}

function authorize(pending: request.Test, caller: Caller): request.Test {
  if (caller.transport === 'bearer') {
    return pending.set('Authorization', `Bearer ${caller.sessionToken}`);
  }
  return pending.set('Cookie', `${COOKIE_NAME}=${caller.sessionToken}`).set('X-Requested-With', 'XMLHttpRequest');
}

function putPassword({ app }: TestApp, caller: Caller, body: unknown): Promise<request.Response> {
  return authorize(request(app).put(PASSWORD_ROUTE), caller)
    .send(body as object)
    .then((response) => response);
}

function getMe({ app }: TestApp, caller: Caller): Promise<request.Response> {
  return authorize(request(app).get(ME_ROUTE), caller).then((response) => response);
}

function bearer(sessionToken: string): Caller {
  return { sessionToken, transport: 'bearer' };
}

function cookie(sessionToken: string): Caller {
  return { sessionToken, transport: 'cookie' };
}

function errorShape(response: request.Response) {
  const { code } = (response.body.error ?? {}) as { code?: string };
  return { code, status: response.status };
}

function readIssuedToken(response: request.Response): string {
  return String((response.body.data as Record<string, unknown>).token);
}

function createCountingDeriveKey() {
  const counter = { calls: 0 };
  const deriveKey: DeriveKey = (input, salt, keyBytes, options) => {
    counter.calls += 1;
    return realDeriveKey(input, salt, keyBytes, options);
  };
  return { counter, deriveKey };
}

function createBreachedClientFor(value: string) {
  const sha1 = sha1Upper(value);
  return createFakePasswordBreachClient({
    ranges: { [sha1.slice(0, PREFIX_LENGTH)]: `${sha1.slice(PREFIX_LENGTH)}:${BREACH_COUNT}` },
  });
}

async function insertUser(
  email: string,
  fields: { passwordHash?: string | null; passwordUpdatedAt?: Date | null } = {},
): Promise<string> {
  const { passwordHash = null, passwordUpdatedAt = null } = fields;
  const { rows } = await database.pool.query<{ id: string }>(
    'INSERT INTO users (email, password_hash, password_updated_at) VALUES ($1, $2, $3) RETURNING id',
    [email, passwordHash, passwordUpdatedAt],
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

async function readRevocations(userId: string): Promise<Map<string, Date | null>> {
  const { rows } = await database.pool.query<{ id: string; revoked_at: Date | null }>(
    'SELECT id, revoked_at FROM sessions WHERE user_id = $1',
    [userId],
  );
  return new Map(rows.map(({ id, revoked_at: revokedAt }) => [id, revokedAt]));
}

async function sessionIdOf(sessionToken: string): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>('SELECT id FROM sessions WHERE token_hash = $1', [
    createHash('sha256').update(sessionToken).digest(),
  ]);
  return rows[0]?.id ?? '';
}

// A real code sign-in (POST /v1/auth/codes then POST /v1/auth/sessions) at the test clock's time.
async function signInByCode(testApp: TestApp, email: string): Promise<string> {
  const issued = await request(testApp.app).post(CODES_ROUTE).send({ email });
  expect(issued.status).toBe(HTTP_ACCEPTED);
  const { code } = testApp.sentCodes[testApp.sentCodes.length - 1] ?? { code: '' };
  const response = await request(testApp.app)
    .post(SESSIONS_ROUTE)
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('X-Client', 'native')
    .send({ code, email });
  expect(response.status).toBe(HTTP_CREATED);
  return readIssuedToken(response);
}

// A real password sign-in (POST /v1/auth/sessions/password) at the test clock's time.
async function signInByPassword(testApp: TestApp, email: string, value: string): Promise<string> {
  const response = await request(testApp.app)
    .post(PASSWORD_SIGN_IN_ROUTE)
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('X-Client', 'native')
    .send({ email, password: value });
  expect(response.status).toBe(HTTP_CREATED);
  return readIssuedToken(response);
}

describe.skipIf(SKIP_DATABASE_TESTS)('PUT /v1/me/password', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  describe('with the current password (B-80, B-81)', () => {
    it(
      'answers a password session sending the right current password with 200 { data: { hasPassword: true } }; the new password verifies, the old does not, and password_updated_at is set',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const oldValue = buildPassword();
        const newValue = buildPassword();
        const earlier = new Date(testApp.clock.now().getTime() - 30 * DAY_MS);
        const userId = await insertUser(email, {
          passwordHash: await hashPassword(oldValue),
          passwordUpdatedAt: earlier,
        });
        const signedIn = await signInByPassword(testApp, email, oldValue);

        const response = await putPassword(
          testApp,
          bearer(signedIn),
          passwordBody({ current: oldValue, next: newValue }),
        );

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { hasPassword: true } });
        const stored = await readUser(userId);
        const storedHash = String(stored?.password_hash);
        expect(storedHash.startsWith(CURRENT_HASH_PREFIX)).toBe(true);
        expect(await verifyPassword(newValue, storedHash)).toBe(true);
        expect(await verifyPassword(oldValue, storedHash)).toBe(false);
        expect(stored?.password_updated_at).toEqual(testApp.clock.now());
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a password session 1 second old without a current password with 403 AUTH_REAUTH_REQUIRED, deriving nothing and changing nothing',
      async () => {
        const { counter, deriveKey } = createCountingDeriveKey();
        const testApp = createApp({ deriveKey });
        const email = buildEmail();
        const storedHash = await hashPassword(buildPassword());
        const userId = await insertUser(email, { passwordHash: storedHash, passwordUpdatedAt: testApp.clock.now() });
        const current = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: new Date(testApp.clock.now().getTime() - SECOND_MS),
          userId,
        });
        const other = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });

        const response = await putPassword(
          testApp,
          bearer(current.sessionToken),
          passwordBody({ next: buildPassword() }),
        );

        expect(errorShape(response)).toEqual({ code: 'AUTH_REAUTH_REQUIRED', status: HTTP_FORBIDDEN });
        expect(counter.calls).toBe(0);
        expect((await readUser(userId))?.password_hash).toBe(storedHash);
        expect((await readRevocations(userId)).get(other.sessionId)).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a wrong current password with 400 AUTH_INVALID_CREDENTIALS, leaving the hash and every session as they were',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const storedHash = await hashPassword(buildPassword());
        const updatedAt = new Date(testApp.clock.now().getTime() - DAY_MS);
        const userId = await insertUser(email, { passwordHash: storedHash, passwordUpdatedAt: updatedAt });
        const current = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });
        const other = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });

        const response = await putPassword(
          testApp,
          bearer(current.sessionToken),
          passwordBody({ current: buildPassword(), next: buildPassword() }),
        );

        expect(errorShape(response)).toEqual({ code: 'AUTH_INVALID_CREDENTIALS', status: HTTP_BAD_REQUEST });
        const stored = await readUser(userId);
        expect(stored?.password_hash).toBe(storedHash);
        expect(stored?.password_updated_at).toEqual(updatedAt);
        expect((await readRevocations(userId)).get(other.sessionId)).toBeNull();
        expect((await getMe(testApp, bearer(other.sessionToken))).status).toBe(HTTP_OK);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('fresh code sign-in (B-80, B-85)', () => {
    it(
      'lets a code session 5 minutes old set a new password without the current one for a user who has one (forgot password)',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const oldValue = buildPassword();
        const newValue = buildPassword();
        const userId = await insertUser(email, {
          passwordHash: await hashPassword(oldValue),
          passwordUpdatedAt: testApp.clock.now(),
        });
        const signedIn = await signInByCode(testApp, email);
        testApp.clock.advance(5 * MINUTE_MS);

        const response = await putPassword(testApp, bearer(signedIn), passwordBody({ next: newValue }));

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { hasPassword: true } });
        const storedHash = String((await readUser(userId))?.password_hash);
        expect(await verifyPassword(newValue, storedHash)).toBe(true);
        expect(await verifyPassword(oldValue, storedHash)).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'lets a code session 5 minutes old add a password to a code-only user, setting password_updated_at',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const newValue = buildPassword();
        const userId = await insertUser(email);
        const signedIn = await signInByCode(testApp, email);
        testApp.clock.advance(5 * MINUTE_MS);

        const response = await putPassword(testApp, bearer(signedIn), passwordBody({ next: newValue }));

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { hasPassword: true } });
        const stored = await readUser(userId);
        expect(await verifyPassword(newValue, String(stored?.password_hash))).toBe(true);
        expect(stored?.password_updated_at).toEqual(testApp.clock.now());
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a code session 11 minutes old with 403 AUTH_REAUTH_REQUIRED for a user with a password and for a code-only user, changing nothing',
      async () => {
        const testApp = createApp();
        const withPasswordEmail = buildEmail();
        const codeOnlyEmail = buildEmail();
        const storedHash = await hashPassword(buildPassword());
        const withPasswordId = await insertUser(withPasswordEmail, {
          passwordHash: storedHash,
          passwordUpdatedAt: testApp.clock.now(),
        });
        const codeOnlyId = await insertUser(codeOnlyEmail);
        const withPasswordSession = await signInByCode(testApp, withPasswordEmail);
        const codeOnlySession = await signInByCode(testApp, codeOnlyEmail);
        testApp.clock.advance(11 * MINUTE_MS);

        const responses = [
          await putPassword(testApp, bearer(withPasswordSession), passwordBody({ next: buildPassword() })),
          await putPassword(testApp, bearer(codeOnlySession), passwordBody({ next: buildPassword() })),
        ];

        for (const response of responses) {
          expect(errorShape(response)).toEqual({ code: 'AUTH_REAUTH_REQUIRED', status: HTTP_FORBIDDEN });
        }
        expect((await readUser(withPasswordId))?.password_hash).toBe(storedHash);
        expect(await readUser(codeOnlyId)).toEqual({ password_hash: null, password_updated_at: null });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a code-only user who sends any current password with 400 AUTH_INVALID_CREDENTIALS, even from a fresh code session',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const userId = await insertUser(email);
        const signedIn = await signInByCode(testApp, email);

        const response = await putPassword(
          testApp,
          bearer(signedIn),
          passwordBody({ current: buildPassword(), next: buildPassword() }),
        );

        expect(errorShape(response)).toEqual({ code: 'AUTH_INVALID_CREDENTIALS', status: HTTP_BAD_REQUEST });
        expect(await readUser(userId)).toEqual({ password_hash: null, password_updated_at: null });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('NFKC normalization', () => {
    it(
      'sets a password holding U+FB01 that then signs in as the letters fi and is accepted as the current password when spelled fi',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const stem = buildPassword();
        const ligatured = stem.concat(LIGATURE_FI);
        const spelled = stem.concat('f', 'i');
        expect(ligatured).not.toBe(spelled);
        expect(ligatured.normalize('NFKC')).toBe(spelled);
        const userId = await insertUser(email);
        const codeSession = await signInByCode(testApp, email);

        const set = await putPassword(testApp, bearer(codeSession), passwordBody({ next: ligatured }));
        expect(set.status).toBe(HTTP_OK);
        const passwordSession = await signInByPassword(testApp, email, spelled);
        const finalValue = buildPassword();
        const changed = await putPassword(
          testApp,
          bearer(passwordSession),
          passwordBody({ current: spelled, next: finalValue }),
        );

        expect(changed.status).toBe(HTTP_OK);
        expect(await verifyPassword(finalValue, String((await readUser(userId))?.password_hash))).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('revoking other sessions (B-81)', () => {
    it(
      "revokes the user's other cookie and bearer sessions, keeps the current one, and leaves another user's sessions alone",
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const oldValue = buildPassword();
        const userId = await insertUser(email, {
          passwordHash: await hashPassword(oldValue),
          passwordUpdatedAt: testApp.clock.now(),
        });
        const current = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });
        const otherCookie = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });
        const otherBearer = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });
        const strangerId = await insertUser(buildEmail());
        const strangerFirst = await insertSession(database.pool, {
          createdAt: testApp.clock.now(),
          userId: strangerId,
        });
        const strangerSecond = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId: strangerId,
        });
        expect((await getMe(testApp, cookie(otherCookie.sessionToken))).status).toBe(HTTP_OK);
        expect((await getMe(testApp, bearer(otherBearer.sessionToken))).status).toBe(HTTP_OK);

        const response = await putPassword(
          testApp,
          cookie(current.sessionToken),
          passwordBody({ current: oldValue, next: buildPassword() }),
        );

        expect(response.status).toBe(HTTP_OK);
        expect(errorShape(await getMe(testApp, cookie(otherCookie.sessionToken)))).toEqual({
          code: 'AUTH_SESSION_REQUIRED',
          status: HTTP_UNAUTHORIZED,
        });
        expect((await getMe(testApp, bearer(otherBearer.sessionToken))).status).toBe(HTTP_UNAUTHORIZED);
        const currentMe = await getMe(testApp, cookie(current.sessionToken));
        expect(currentMe.status).toBe(HTTP_OK);
        expect(currentMe.body.data.hasPassword).toBe(true);
        expect((await getMe(testApp, bearer(strangerFirst.sessionToken))).status).toBe(HTTP_OK);
        expect((await getMe(testApp, cookie(strangerSecond.sessionToken))).status).toBe(HTTP_OK);
        const revocations = await readRevocations(userId);
        expect(revocations.get(current.sessionId)).toBeNull();
        expect(revocations.get(otherCookie.sessionId)).toBeInstanceOf(Date);
        expect(revocations.get(otherBearer.sessionId)).toBeInstanceOf(Date);
        expect([...(await readRevocations(strangerId)).values()]).toEqual([null, null]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'revokes other sessions when a fresh code session adds a first password to a code-only account',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const userId = await insertUser(email);
        const older = await insertSession(database.pool, {
          createdAt: new Date(testApp.clock.now().getTime() - DAY_MS),
          lastUsedAt: testApp.clock.now(),
          userId,
        });
        const signedIn = await signInByCode(testApp, email);

        const response = await putPassword(testApp, bearer(signedIn), passwordBody({ next: buildPassword() }));

        expect(response.status).toBe(HTTP_OK);
        expect((await getMe(testApp, bearer(older.sessionToken))).status).toBe(HTTP_UNAUTHORIZED);
        expect((await getMe(testApp, bearer(signedIn))).status).toBe(HTTP_OK);
        const revocations = await readRevocations(userId);
        expect(revocations.get(older.sessionId)).toBeInstanceOf(Date);
        expect(revocations.get(await sessionIdOf(signedIn))).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('password policy and breach check on newPassword (B-81)', () => {
    it(
      'answers a too-short and a too-long new password with their 400 codes, deriving nothing and changing nothing',
      async () => {
        const { counter, deriveKey } = createCountingDeriveKey();
        const testApp = createApp({ deriveKey });
        const email = buildEmail();
        const oldValue = buildPassword();
        const storedHash = await hashPassword(oldValue);
        const userId = await insertUser(email, { passwordHash: storedHash, passwordUpdatedAt: testApp.clock.now() });
        const current = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });
        const other = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });

        const tooShort = await putPassword(
          testApp,
          bearer(current.sessionToken),
          passwordBody({ current: oldValue, next: buildHexOfLength(TOO_SHORT_LENGTH) }),
        );
        const tooLong = await putPassword(
          testApp,
          bearer(current.sessionToken),
          passwordBody({ current: oldValue, next: buildHexOfLength(TOO_LONG_LENGTH) }),
        );

        expect(errorShape(tooShort)).toEqual({ code: 'AUTH_PASSWORD_TOO_SHORT', status: HTTP_BAD_REQUEST });
        expect(errorShape(tooLong)).toEqual({ code: 'AUTH_PASSWORD_TOO_LONG', status: HTTP_BAD_REQUEST });
        expect(counter.calls).toBe(0);
        expect((await readUser(userId))?.password_hash).toBe(storedHash);
        expect((await readRevocations(userId)).get(other.sessionId)).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'answers a breached new password with 400 AUTH_PASSWORD_BREACHED after sending only its 5-character SHA-1 prefix, changing nothing',
      async () => {
        const breachedValue = buildPassword();
        const passwordBreachClient = createBreachedClientFor(breachedValue);
        const testApp = createApp({ passwordBreachClient });
        const email = buildEmail();
        const oldValue = buildPassword();
        const storedHash = await hashPassword(oldValue);
        const userId = await insertUser(email, { passwordHash: storedHash, passwordUpdatedAt: testApp.clock.now() });
        const current = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });
        const other = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });

        const response = await putPassword(
          testApp,
          bearer(current.sessionToken),
          passwordBody({ current: oldValue, next: breachedValue }),
        );

        expect(errorShape(response)).toEqual({ code: 'AUTH_PASSWORD_BREACHED', status: HTTP_BAD_REQUEST });
        expect(passwordBreachClient.requestedPrefixes).toEqual([sha1Upper(breachedValue).slice(0, PREFIX_LENGTH)]);
        expect((await readUser(userId))?.password_hash).toBe(storedHash);
        expect((await readRevocations(userId)).get(other.sessionId)).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'breach-checks only the new password on success: one 5-character prefix, never the current password',
      async () => {
        const passwordBreachClient = createFakePasswordBreachClient({});
        const testApp = createApp({ passwordBreachClient });
        const email = buildEmail();
        const oldValue = buildPassword();
        const newValue = buildPassword();
        const userId = await insertUser(email, {
          passwordHash: await hashPassword(oldValue),
          passwordUpdatedAt: testApp.clock.now(),
        });
        const current = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });

        const response = await putPassword(
          testApp,
          bearer(current.sessionToken),
          passwordBody({ current: oldValue, next: newValue }),
        );

        expect(response.status).toBe(HTTP_OK);
        expect(passwordBreachClient.requestedPrefixes).toEqual([sha1Upper(newValue).slice(0, PREFIX_LENGTH)]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('a stored hash that changes between verifying currentPassword and the transaction', () => {
    it(
      'answers 400 AUTH_INVALID_CREDENTIALS, keeps the newer hash, and revokes nothing',
      async () => {
        const email = buildEmail();
        const oldValue = buildPassword();
        const updatedAt = new Date(Date.now() - DAY_MS);
        const userId = await insertUser(email, {
          passwordHash: await hashPassword(oldValue),
          passwordUpdatedAt: updatedAt,
        });
        const newerHash = await hashPassword(buildPassword());
        let calls = 0;
        // The route derives twice (verify currentPassword, derive the new hash) before its
        // transaction; another change lands after the second derivation.
        const deriveKey: DeriveKey = async (input, salt, keyBytes, options) => {
          calls += 1;
          const derived = await realDeriveKey(input, salt, keyBytes, options);
          if (calls === 2) {
            await database.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, newerHash]);
          }
          return derived;
        };
        const testApp = createApp({ deriveKey });
        const current = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });
        const other = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });

        const response = await putPassword(
          testApp,
          bearer(current.sessionToken),
          passwordBody({ current: oldValue, next: buildPassword() }),
        );

        expect(calls).toBe(2);
        expect(errorShape(response)).toEqual({ code: 'AUTH_INVALID_CREDENTIALS', status: HTTP_BAD_REQUEST });
        const stored = await readUser(userId);
        expect(stored?.password_hash).toBe(newerHash);
        expect(stored?.password_updated_at).toEqual(updatedAt);
        expect((await readRevocations(userId)).get(other.sessionId)).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('concurrent changes for one user', () => {
    it(
      'from two password sessions with the right current password: one 200 and one 400, no 500, and the hash verifies exactly the winner',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const oldValue = buildPassword();
        const userId = await insertUser(email, {
          passwordHash: await hashPassword(oldValue),
          passwordUpdatedAt: testApp.clock.now(),
        });
        const first = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });
        const second = await insertSession(database.pool, {
          authMethod: 'password',
          createdAt: testApp.clock.now(),
          userId,
        });
        const firstValue = buildPassword();
        const secondValue = buildPassword();

        const [firstResponse, secondResponse] = await Promise.all([
          putPassword(testApp, bearer(first.sessionToken), passwordBody({ current: oldValue, next: firstValue })),
          putPassword(testApp, bearer(second.sessionToken), passwordBody({ current: oldValue, next: secondValue })),
        ]);

        const statuses = [firstResponse.status, secondResponse.status];
        expect([...statuses].sort()).toEqual([HTTP_OK, HTTP_BAD_REQUEST]);
        const isFirstWinner = firstResponse.status === HTTP_OK;
        const loser = isFirstWinner ? secondResponse : firstResponse;
        expect(errorShape(loser)).toEqual({ code: 'AUTH_INVALID_CREDENTIALS', status: HTTP_BAD_REQUEST });
        const storedHash = String((await readUser(userId))?.password_hash);
        const verifies = [await verifyPassword(firstValue, storedHash), await verifyPassword(secondValue, storedHash)];
        expect(verifies).toEqual([isFirstWinner, !isFirstWinner]);
        const [winnerSession, loserSession] = isFirstWinner ? [first, second] : [second, first];
        expect((await getMe(testApp, bearer(winnerSession.sessionToken))).status).toBe(HTTP_OK);
        expect((await getMe(testApp, bearer(loserSession.sessionToken))).status).toBe(HTTP_UNAUTHORIZED);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'from one fresh code session twice at once: no 500, and the hash verifies exactly one of the two new passwords',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const userId = await insertUser(email);
        const signedIn = await signInByCode(testApp, email);
        const firstValue = buildPassword();
        const secondValue = buildPassword();

        const responses = await Promise.all([
          putPassword(testApp, bearer(signedIn), passwordBody({ next: firstValue })),
          putPassword(testApp, bearer(signedIn), passwordBody({ next: secondValue })),
        ]);

        for (const response of responses) {
          expect(response.status).toBeLessThan(HTTP_SERVER_ERROR);
        }
        expect(responses.map(({ status }) => status)).toContain(HTTP_OK);
        const storedHash = String((await readUser(userId))?.password_hash);
        const verifies = [await verifyPassword(firstValue, storedHash), await verifyPassword(secondValue, storedHash)];
        expect(verifies.filter(Boolean)).toHaveLength(1);
        expect((await getMe(testApp, bearer(signedIn))).status).toBe(HTTP_OK);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('hasPassword on GET /v1/me (B-82)', () => {
    it(
      'is false for a code-only user and true after a set, and no response carries a $scrypt$ hash',
      async () => {
        const testApp = createApp();
        const email = buildEmail();
        const userId = await insertUser(email);
        const signedIn = await signInByCode(testApp, email);

        const before = await getMe(testApp, bearer(signedIn));
        const set = await putPassword(testApp, bearer(signedIn), passwordBody({ next: buildPassword() }));
        const after = await getMe(testApp, bearer(signedIn));

        expect(before.status).toBe(HTTP_OK);
        expect(before.body.data.hasPassword).toBe(false);
        expect(set.status).toBe(HTTP_OK);
        expect(after.status).toBe(HTTP_OK);
        expect(after.body.data.hasPassword).toBe(true);
        const storedHash = String((await readUser(userId))?.password_hash);
        for (const response of [before, set, after]) {
          expect(response.text).not.toContain('$scrypt$');
          expect(response.text).not.toContain(storedHash);
          expect(JSON.stringify(response.headers)).not.toContain('$scrypt$');
        }
      },
      TEST_TIMEOUT_MS,
    );
  });
});
