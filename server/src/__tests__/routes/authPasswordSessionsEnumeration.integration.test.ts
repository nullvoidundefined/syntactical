// Task 7.5 (B-77, threat model "Account enumeration" and "Enumeration by timing"): POST
// /v1/auth/sessions/password answers an unknown email, a code-only account (null hash), a stored
// hash the parser rejects, and a wrong password identically (status, body bytes apart from
// requestId, header names, no cookie), and each runs exactly one scrypt derivation: the first
// three against the startup dummy hash. A checked password of 129 to 512 code points is one more
// wrong password. Every password is built at run time.
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { DeriveKey } from '../../services/passwordHash.js';
import { hashPassword } from '../../services/passwordHash.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SIGN_IN_ROUTE = '/v1/auth/sessions/password';
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 60_000;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const MAX_LENGTH = 128;
const RAW_MAX_LENGTH = 512;
const CLIENT_IP = '192.0.2.10';
const REQUEST_ID_PLACEHOLDER = '<request-id>';
const SCRYPT_PREFIX = '$scrypt$';
const SALT_FIELD = 4;

const realDeriveKey = promisify(scrypt) as DeriveKey;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function buildPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString('hex');
}

function buildHexOfLength(length: number): string {
  return randomBytes(length).toString('hex').slice(0, length);
}

function withPassword(value: string): Record<'password', string> {
  return { password: value };
}

// Records the salt of every derivation, so a test can tell which stored string was verified against.
function createRecordingDeriveKey() {
  const salts: Buffer[] = [];
  const deriveKey: DeriveKey = (input, salt, keyBytes, options) => {
    salts.push(Buffer.from(salt));
    return realDeriveKey(input, salt, keyBytes, options);
  };
  return { deriveKey, salts };
}

function saltOf(stored: string): Buffer {
  return Buffer.from(stored.split('$')[SALT_FIELD] ?? '', 'base64');
}

// Stored strings that pass the column's `$scrypt$` check but that the parser rejects.
function buildUnparseableHash(): string {
  return SCRYPT_PREFIX.concat('v=1$ln=17,r=8,p=1$', randomBytes(EMAIL_BYTES).toString('hex'), '$!');
}

async function buildTruncatedHash(): Promise<string> {
  const whole = await hashPassword(buildPassword());
  return whole.slice(0, -1);
}

async function insertUser(email: string, passwordHash: string | null): Promise<void> {
  await database.pool.query(
    `INSERT INTO users (email, password_hash, password_updated_at)
     VALUES ($1, $2::text, CASE WHEN $2::text IS NULL THEN NULL ELSE now() END)`,
    [email, passwordHash],
  );
}

async function snapshotUsers(): Promise<string> {
  const { rows } = await database.pool.query<{ row: string }>(
    'SELECT row_to_json(u)::text AS row FROM users u ORDER BY id',
  );
  return JSON.stringify(rows.map(({ row }) => row));
}

async function countSessions(): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>('SELECT count(*) FROM sessions');
  return Number(rows[0]?.count);
}

function postSignIn({ app }: TestApp, body: Record<string, unknown>): Promise<request.Response> {
  return request(app)
    .post(SIGN_IN_ROUTE)
    .set('X-Forwarded-For', CLIENT_IP)
    .set('X-Requested-With', 'XMLHttpRequest')
    .send(body)
    .then((response) => response);
}

// The body text with its requestId value replaced, so two answers compare byte for byte.
function bodyWithoutRequestId(response: request.Response): string {
  const requestId = String((response.body as { error?: { requestId?: string } }).error?.requestId ?? '');
  expect(requestId.length).toBeGreaterThan(0);
  return response.text.split(requestId).join(REQUEST_ID_PLACEHOLDER);
}

function headerNames(response: request.Response): string[] {
  return Object.keys(response.headers).sort();
}

function expectIdenticalFailures(responses: request.Response[]): void {
  const [first, ...rest] = responses;
  expect(first?.status).toBe(HTTP_BAD_REQUEST);
  expect((first?.body as { error?: { code?: string } }).error?.code).toBe('AUTH_INVALID_CREDENTIALS');
  for (const response of responses) {
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  for (const response of rest) {
    expect(response.status).toBe(first?.status);
    expect(bodyWithoutRequestId(response)).toBe(bodyWithoutRequestId(first as request.Response));
    expect(headerNames(response)).toEqual(headerNames(first as request.Response));
    expect(response.headers['content-type']).toBe(first?.headers['content-type']);
    expect(response.headers['content-length']).toBe(first?.headers['content-length']);
  }
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/auth/sessions/password enumeration', () => {
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
    'answers an unknown email, a code-only account, an unparseable stored hash, and a wrong password identically',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const codeOnlyEmail = buildEmail();
      const unparseableEmail = buildEmail();
      const truncatedEmail = buildEmail();
      const passwordEmail = buildEmail();
      await insertUser(codeOnlyEmail, null);
      await insertUser(unparseableEmail, buildUnparseableHash());
      await insertUser(truncatedEmail, await buildTruncatedHash());
      await insertUser(passwordEmail, await hashPassword(buildPassword()));
      const usersBefore = await snapshotUsers();

      const responses: request.Response[] = [];
      for (const email of [buildEmail(), codeOnlyEmail, unparseableEmail, truncatedEmail, passwordEmail]) {
        responses.push(await postSignIn(testApp, { email, ...withPassword(buildPassword()) }));
      }

      expectIdenticalFailures(responses);
      expect(await snapshotUsers()).toBe(usersBefore);
      expect(await countSessions()).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'runs exactly one derivation for each case, against the dummy hash when no usable stored hash exists',
    async () => {
      const { deriveKey, salts } = createRecordingDeriveKey();
      const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
      const dummySalt = saltOf(testApp.dummyPasswordHash);
      const codeOnlyEmail = buildEmail();
      const unparseableEmail = buildEmail();
      const truncatedEmail = buildEmail();
      const passwordEmail = buildEmail();
      const rightValue = buildPassword();
      const storedHash = await hashPassword(rightValue);
      await insertUser(codeOnlyEmail, null);
      await insertUser(unparseableEmail, buildUnparseableHash());
      await insertUser(truncatedEmail, await buildTruncatedHash());
      await insertUser(passwordEmail, storedHash);

      const cases: Array<{ email: string; expectedSalt: Buffer; value: string }> = [
        { email: buildEmail(), expectedSalt: dummySalt, value: buildPassword() },
        { email: codeOnlyEmail, expectedSalt: dummySalt, value: buildPassword() },
        { email: unparseableEmail, expectedSalt: dummySalt, value: buildPassword() },
        { email: truncatedEmail, expectedSalt: dummySalt, value: buildPassword() },
        { email: passwordEmail, expectedSalt: saltOf(storedHash), value: buildPassword() },
        { email: passwordEmail, expectedSalt: saltOf(storedHash), value: rightValue },
      ];
      const observed: Array<{ calls: number; isExpectedSalt: boolean; status: number }> = [];
      for (const { email, expectedSalt, value } of cases) {
        salts.length = 0;
        const response = await postSignIn(testApp, { email, ...withPassword(value) });
        observed.push({
          calls: salts.length,
          isExpectedSalt: salts.length === 1 && (salts[0]?.equals(expectedSalt) ?? false),
          status: response.status,
        });
      }

      expect(observed).toEqual([
        { calls: 1, isExpectedSalt: true, status: HTTP_BAD_REQUEST },
        { calls: 1, isExpectedSalt: true, status: HTTP_BAD_REQUEST },
        { calls: 1, isExpectedSalt: true, status: HTTP_BAD_REQUEST },
        { calls: 1, isExpectedSalt: true, status: HTTP_BAD_REQUEST },
        { calls: 1, isExpectedSalt: true, status: HTTP_BAD_REQUEST },
        { calls: 1, isExpectedSalt: true, status: HTTP_CREATED },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'answers a checked password of 129 and of 512 code points like any wrong password, after one derivation each',
    async () => {
      const { deriveKey, salts } = createRecordingDeriveKey();
      const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
      const passwordEmail = buildEmail();
      await insertUser(passwordEmail, await hashPassword(buildPassword()));
      const baseline = await postSignIn(testApp, { email: passwordEmail, ...withPassword(buildPassword()) });

      const responses: request.Response[] = [baseline];
      const calls: number[] = [];
      for (const email of [passwordEmail, buildEmail()]) {
        for (const length of [MAX_LENGTH + 1, RAW_MAX_LENGTH]) {
          salts.length = 0;
          responses.push(await postSignIn(testApp, { email, ...withPassword(buildHexOfLength(length)) }));
          calls.push(salts.length);
        }
      }

      expectIdenticalFailures(responses);
      expect(calls).toEqual([1, 1, 1, 1]);
      expect(await countSessions()).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
