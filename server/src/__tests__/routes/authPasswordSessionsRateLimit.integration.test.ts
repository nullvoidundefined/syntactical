// Task 7.5 (B-78, threat model "Credential stuffing"): POST /v1/auth/sessions/password allows 10
// requests per normalized email and 30 per IP in an hour, on its own HMAC-keyed scopes
// (password-sign-in:email, password-sign-in:ip). The IP limit runs before the body is parsed.
// Spending both leaves the code routes (POST /v1/auth/codes, POST /v1/auth/sessions) open for
// the same email and IP. The derivation here is a fast stand-in for scrypt, so the counts run
// quickly; every password is built at run time.
import { createHash, createHmac, randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { DeriveKey } from '../../services/passwordHash.js';
import { hashPassword } from '../../services/passwordHash.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SIGN_IN_ROUTE = '/v1/auth/sessions/password';
const CODES_ROUTE = '/v1/auth/codes';
const SESSIONS_ROUTE = '/v1/auth/sessions';
const HTTP_CREATED = 201;
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 60_000;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
// The spec's numbers (decision 37), written out so the test does not borrow the code's constants.
const PER_EMAIL = 10;
const PER_IP = 30;
const EMAIL_SCOPE = 'password-sign-in:email';
const IP_SCOPE = 'password-sign-in:ip';
const CLIENT_IP = '192.0.2.10';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function buildPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString('hex');
}

function withPassword(value: string): Record<'password', string> {
  return { password: value };
}

function spreadIp(index: number): string {
  return `198.51.100.${index + 1}`;
}

function hmacHex(keySecret: string, value: string): string {
  return createHmac('sha256', keySecret).update(value).digest('hex');
}

// A fast stand-in for scrypt with the same shape: deterministic per input and salt.
function createFastDeriveKey() {
  const counter = { calls: 0 };
  const deriveKey: DeriveKey = (input, salt, keyBytes) => {
    counter.calls += 1;
    const digest = createHash('sha512').update(salt).update(input).digest();
    return Promise.resolve(digest.subarray(0, keyBytes));
  };
  return { counter, deriveKey };
}

function postSignIn({ app }: TestApp, body: unknown, ip: string): Promise<request.Response> {
  return request(app)
    .post(SIGN_IN_ROUTE)
    .set('X-Forwarded-For', ip)
    .set('X-Requested-With', 'XMLHttpRequest')
    .send(body as object)
    .then((response) => response);
}

async function insertUser(email: string, passwordHash: string): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, password_updated_at) VALUES ($1, $2, now()) RETURNING id`,
    [email, passwordHash],
  );
  return rows[0]?.id ?? '';
}

async function counterKeys(): Promise<string[]> {
  const { rows } = await database.pool.query<{ key: string }>('SELECT key FROM rate_limit_counters');
  return rows.map(({ key }) => key);
}

async function countSessions(): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>('SELECT count(*) FROM sessions');
  return Number(rows[0]?.count);
}

function errorCode(response: request.Response): string | undefined {
  return (response.body as { error?: { code?: string } }).error?.code;
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/auth/sessions/password rate limits', () => {
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
    'answers the 11th request in an hour for one normalized email with 429, even with the right password',
    async () => {
      const { deriveKey } = createFastDeriveKey();
      const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
      const email = buildEmail();
      const rightValue = buildPassword();
      await insertUser(email, await hashPassword(rightValue, { deriveKey }));
      const spellings = [email, email.toUpperCase(), `  ${email} `, ` ${email.toUpperCase()}`];

      const statuses: number[] = [];
      for (let index = 0; index < PER_EMAIL; index += 1) {
        const spelling = spellings[index % spellings.length] ?? email;
        const response = await postSignIn(
          testApp,
          { email: spelling, ...withPassword(buildPassword()) },
          spreadIp(index),
        );
        statuses.push(response.status);
      }
      const limited = await postSignIn(testApp, { email, ...withPassword(rightValue) }, spreadIp(PER_EMAIL));

      expect(statuses).toEqual(Array.from({ length: PER_EMAIL }, () => HTTP_BAD_REQUEST));
      expect(limited.status).toBe(HTTP_TOO_MANY_REQUESTS);
      expect(errorCode(limited)).toBe('RATE_LIMIT_EXCEEDED');
      expect(limited.headers['set-cookie']).toBeUndefined();
      expect(await countSessions()).toBe(0);
      const keys = await counterKeys();
      expect(keys).toContain(`${EMAIL_SCOPE}:${hmacHex(testApp.rateLimitKeySecret, email)}`);
      for (const key of keys) {
        expect(key).not.toContain(email);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'answers the 31st request from one IP with 429 even when its body is malformed, without parsing or deriving',
    async () => {
      const { counter, deriveKey } = createFastDeriveKey();
      const testApp = createAuthTestApp({ deriveKey, pool: database.pool });

      const statuses: number[] = [];
      for (let index = 0; index < PER_IP; index += 1) {
        statuses.push((await postSignIn(testApp, {}, CLIENT_IP)).status);
      }
      const malformed = await postSignIn(testApp, {}, CLIENT_IP);
      const wellFormed = await postSignIn(
        testApp,
        { email: buildEmail(), ...withPassword(buildPassword()) },
        CLIENT_IP,
      );

      expect(statuses).toEqual(Array.from({ length: PER_IP }, () => HTTP_BAD_REQUEST));
      expect(malformed.status).toBe(HTTP_TOO_MANY_REQUESTS);
      expect(errorCode(malformed)).toBe('RATE_LIMIT_EXCEEDED');
      expect(wellFormed.status).toBe(HTTP_TOO_MANY_REQUESTS);
      expect(counter.calls).toBe(0);
      const keys = await counterKeys();
      expect(keys).toContain(`${IP_SCOPE}:${hmacHex(testApp.rateLimitKeySecret, CLIENT_IP)}`);
      for (const key of keys) {
        expect(key).not.toContain(CLIENT_IP);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'leaves POST /v1/auth/codes and POST /v1/auth/sessions open for the same email and IP once both password limits are spent',
    async () => {
      const { deriveKey } = createFastDeriveKey();
      const testApp = createAuthTestApp({ deriveKey, pool: database.pool });
      const email = buildEmail();
      await insertUser(email, await hashPassword(buildPassword(), { deriveKey }));

      const statuses: number[] = [];
      for (let index = 0; index <= PER_IP; index += 1) {
        statuses.push((await postSignIn(testApp, { email, ...withPassword(buildPassword()) }, CLIENT_IP)).status);
      }
      const otherEmail = await postSignIn(
        testApp,
        { email: buildEmail(), ...withPassword(buildPassword()) },
        CLIENT_IP,
      );
      const otherIp = await postSignIn(testApp, { email, ...withPassword(buildPassword()) }, spreadIp(0));

      const issued = await request(testApp.app).post(CODES_ROUTE).set('X-Forwarded-For', CLIENT_IP).send({ email });
      const { code } = testApp.sentCodes[testApp.sentCodes.length - 1] ?? { code: '' };
      const signedIn = await request(testApp.app)
        .post(SESSIONS_ROUTE)
        .set('X-Forwarded-For', CLIENT_IP)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ code, email });

      expect(statuses.slice(0, PER_EMAIL)).toEqual(Array.from({ length: PER_EMAIL }, () => HTTP_BAD_REQUEST));
      expect(statuses.slice(PER_EMAIL)).toEqual(
        Array.from({ length: PER_IP + 1 - PER_EMAIL }, () => HTTP_TOO_MANY_REQUESTS),
      );
      expect(otherEmail.status).toBe(HTTP_TOO_MANY_REQUESTS);
      expect(otherIp.status).toBe(HTTP_TOO_MANY_REQUESTS);
      expect(issued.status).toBe(HTTP_ACCEPTED);
      expect(signedIn.status).toBe(HTTP_CREATED);
    },
    TEST_TIMEOUT_MS,
  );
});
