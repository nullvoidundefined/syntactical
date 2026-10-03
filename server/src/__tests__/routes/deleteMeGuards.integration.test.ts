// B-59 guards for DELETE /v1/me against a real Postgres: a request with no session is 401 and
// deletes nothing; a cookie session without X-Requested-With, or with a foreign Origin, is 403
// and deletes nothing; and the clearing Set-Cookie carries the same Path and SameSite (and Secure
// when the app sets secure cookies) as the cookie POST /v1/auth/sessions sets.
import { randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AUTH } from '../../constants/auth.js';
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
const HTTP_FORBIDDEN = 403;
const SETUP_TIMEOUT_MS = 120_000;
const HEX_BYTES = 6;
const TOKEN_BYTES = 32;
const CALLER_IP = '198.51.100.7';
const FOREIGN_ORIGIN = 'https://attacker.example';
const COMPARED_ATTRIBUTES = ['path', 'samesite', 'secure'];

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

function buildEmail(): string {
  return `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
}

async function seedAccount(testApp: TestApp): Promise<{ sessionToken: string; userId: string }> {
  const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    buildEmail(),
  ]);
  const [{ id: userId }] = rows;
  const { sessionToken } = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });
  return { sessionToken, userId };
}

// Users and sessions, without last_used_at (requireSession moves it on an authenticated request).
async function snapshot(): Promise<{ sessions: string[]; users: string[] }> {
  const { rows: users } = await database.pool.query<{ row: string }>(
    'SELECT row_to_json(t)::text AS row FROM users t ORDER BY 1',
  );
  const { rows: sessions } = await database.pool.query<{ row: string }>(
    "SELECT json_build_object('id', id, 'user_id', user_id, 'revoked_at', revoked_at)::text AS row FROM sessions ORDER BY 1",
  );
  return { sessions: sessions.map(({ row }) => row), users: users.map(({ row }) => row) };
}

function sessionCookie(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
}

// The named attributes of a Set-Cookie line, lowercased, as `name` or `name=value`, sorted.
function comparedAttributes(cookie: string | undefined): string[] {
  return String(cookie)
    .split(';')
    .slice(1)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => COMPARED_ATTRIBUTES.includes(part.split('=')[0]))
    .sort();
}

async function signInWithCookie(testApp: TestApp): Promise<request.Response> {
  const email = buildEmail();
  const issued = await request(testApp.app).post(CODES_ROUTE).set('X-Forwarded-For', CALLER_IP).send({ email });
  expect(issued.status).toBe(HTTP_ACCEPTED);
  const { code } = testApp.sentCodes[testApp.sentCodes.length - 1] ?? { code: '' };
  return request(testApp.app)
    .post(SESSIONS_ROUTE)
    .set('X-Forwarded-For', CALLER_IP)
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ code, email });
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me guards', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('answers 401 and deletes nothing without a session', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    await seedAccount(testApp);
    const before = await snapshot();

    const response = await request(testApp.app).delete(DELETE_ME_ROUTE).set('X-Requested-With', 'XMLHttpRequest');

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(sessionCookie(response)).toBeUndefined();
    expect(await snapshot()).toEqual(before);
    expect(before.users).toHaveLength(1);
  });

  it('answers 401 and deletes nothing for an unknown session token', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    await seedAccount(testApp);
    const before = await snapshot();

    const response = await request(testApp.app)
      .delete(DELETE_ME_ROUTE)
      .set('Authorization', `Bearer ${randomBytes(TOKEN_BYTES).toString('base64url')}`);

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(await snapshot()).toEqual(before);
    expect(before.users).toHaveLength(1);
  });

  it('answers 403 and deletes nothing for a cookie session without X-Requested-With', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const { sessionToken } = await seedAccount(testApp);
    const before = await snapshot();

    const response = await request(testApp.app).delete(DELETE_ME_ROUTE).set('Cookie', `${COOKIE_NAME}=${sessionToken}`);

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(await snapshot()).toEqual(before);
    expect(before.users).toHaveLength(1);
    expect(before.sessions).toHaveLength(1);
  });

  it('answers 403 and deletes nothing for a cookie session from a foreign Origin', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const { sessionToken } = await seedAccount(testApp);
    const before = await snapshot();

    const response = await request(testApp.app)
      .delete(DELETE_ME_ROUTE)
      .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Origin', FOREIGN_ORIGIN);

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(await snapshot()).toEqual(before);
    expect(before.users).toHaveLength(1);
    expect(before.sessions).toHaveLength(1);
  });

  it.each([true, false])(
    'clears the cookie with the Path, SameSite, and Secure that sign-in set it with (isCookieSecure %s)',
    async (isCookieSecure) => {
      const testApp = createAuthTestApp({ isCookieSecure, pool: database.pool });
      const signedIn = await signInWithCookie(testApp);
      expect(signedIn.status).toBe(HTTP_CREATED);
      const setCookie = sessionCookie(signedIn);
      const sessionToken = String(setCookie).split(';')[0].slice(`${COOKIE_NAME}=`.length);

      const deleted = await request(testApp.app)
        .delete(DELETE_ME_ROUTE)
        .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleted.status).toBe(HTTP_NO_CONTENT);
      const cleared = sessionCookie(deleted);
      expect(cleared).toBeDefined();
      expect(comparedAttributes(cleared)).toEqual(comparedAttributes(setCookie));
      expect(comparedAttributes(setCookie)).toEqual(expect.arrayContaining(['path=/', 'samesite=lax']));
      expect(comparedAttributes(cleared).includes('secure')).toBe(isCookieSecure);
    },
  );
});
