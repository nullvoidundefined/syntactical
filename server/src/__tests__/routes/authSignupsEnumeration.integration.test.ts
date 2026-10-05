// Task 7.4 (B-72, threat model "Account enumeration" and "Unverified-email takeover"): POST
// /v1/auth/signups answers a new email, a code-only account, and an account with a password
// identically (status, body bytes, header names), sends one code each time, and never touches
// the users table. Every password is built at run time.
import { randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { hashPassword } from '../../services/passwordHash.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SIGNUPS_ROUTE = '/v1/auth/signups';
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const RAW_MAX_LENGTH = 512;
const CLIENT_IP = '192.0.2.10';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function buildPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString('hex');
}

function withPassword(value: string): Record<'password', string> {
  return { password: value };
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

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/auth/signups enumeration', () => {
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
    'answers a new email, a code-only account, and an account with a password identically',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const newEmail = buildEmail();
      const codeOnlyEmail = buildEmail();
      const passwordEmail = buildEmail();
      await insertUser(codeOnlyEmail, null);
      await insertUser(passwordEmail, await hashPassword(buildPassword()));
      const usersBefore = await snapshotUsers();

      const responses = [];
      for (const email of [newEmail, codeOnlyEmail, passwordEmail]) {
        responses.push(
          await request(testApp.app)
            .post(SIGNUPS_ROUTE)
            .set('X-Forwarded-For', CLIENT_IP)
            .send({ email, ...withPassword(buildPassword()) }),
        );
      }

      expect(responses.map(({ status }) => status)).toEqual([HTTP_ACCEPTED, HTTP_ACCEPTED, HTTP_ACCEPTED]);
      const [first, ...rest] = responses;
      for (const response of rest) {
        expect(response.text).toBe(first?.text);
        expect(Object.keys(response.headers).sort()).toEqual(Object.keys(first?.headers ?? {}).sort());
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      expect(testApp.sentCodes.map(({ email }) => email)).toEqual([newEmail, codeOnlyEmail, passwordEmail]);
      expect(await snapshotUsers()).toBe(usersBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'answers an oversized password identically for a new and an existing email, sending nothing',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const newEmail = buildEmail();
      const passwordEmail = buildEmail();
      await insertUser(passwordEmail, await hashPassword(buildPassword()));
      const usersBefore = await snapshotUsers();
      const oversized = randomBytes(RAW_MAX_LENGTH)
        .toString('hex')
        .slice(0, RAW_MAX_LENGTH + 1);

      const responses = [];
      for (const email of [newEmail, passwordEmail]) {
        responses.push(
          await request(testApp.app)
            .post(SIGNUPS_ROUTE)
            .set('X-Forwarded-For', CLIENT_IP)
            .send({ email, ...withPassword(oversized) }),
        );
      }

      const shapes = responses.map(({ body, status }) => {
        const { code, message } = (body.error ?? {}) as { code?: string; message?: string };
        return { code, message, status };
      });
      expect(shapes[0]).toEqual({ code: 'INPUT_INVALID_BODY', message: expect.any(String), status: HTTP_BAD_REQUEST });
      expect(shapes[1]).toEqual(shapes[0]);
      expect(testApp.sentCodes).toEqual([]);
      expect(await snapshotUsers()).toBe(usersBefore);
    },
    TEST_TIMEOUT_MS,
  );
});
