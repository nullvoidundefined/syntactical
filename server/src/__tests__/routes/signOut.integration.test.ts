// B-3.5 (B-31, B-63): DELETE /v1/auth/sessions/current revokes the caller's session, clears the
// cookie with the attributes it was set with, and the same token then gets 401. A cookie
// sign-out still needs X-Requested-With; a native bearer sign-out does not.
import { randomBytes } from 'node:crypto';

import type { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const CODES_ROUTE = '/v1/auth/codes';
const SESSIONS_ROUTE = '/v1/auth/sessions';
const SIGN_OUT_ROUTE = '/v1/auth/sessions/current';
const PROBE_ROUTE = '/test/session';
const COOKIE_NAME = 'syntactical_session';
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const SETUP_TIMEOUT_MS = 120_000;
const EMAIL_BYTES = 6;
const EPOCH_EXPIRY = 'expires=thu, 01 jan 1970 00:00:00 gmt';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function createProbeApp() {
  const { createRequireSession } = await import('../../middleware/requireSession.js');
  return createAuthTestApp({
    extraRoutes(router: Router, clock) {
      router.get(PROBE_ROUTE, createRequireSession({ database: database.pool, now: clock.now }), (_req, res) => {
        res.status(HTTP_OK).json({ data: { ok: true } });
      });
    },
    pool: database.pool,
  });
}

type ProbeApp = Awaited<ReturnType<typeof createProbeApp>>;

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function sessionCookie(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
}

async function signInOnWeb({ app, sentCodes }: ProbeApp): Promise<string> {
  const email = buildEmail();
  await request(app).post(CODES_ROUTE).send({ email });
  const { code } = sentCodes[sentCodes.length - 1];
  const response = await request(app)
    .post(SESSIONS_ROUTE)
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ code, email });
  const cookie = String(sessionCookie(response));
  return cookie.slice(0, cookie.indexOf(';'));
}

async function revokedAt(sessionId: string): Promise<Date | null> {
  const { rows } = await database.pool.query<{ revoked_at: Date | null }>(
    'SELECT revoked_at FROM sessions WHERE id = $1',
    [sessionId],
  );
  const [{ revoked_at: value }] = rows;
  return value;
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/auth/sessions/current', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('revokes a web session, clears the cookie with its attributes, and the cookie then gets 401', async () => {
    const probe = await createProbeApp();
    const cookie = await signInOnWeb(probe);
    const before = await request(probe.app).get(PROBE_ROUTE).set('Cookie', cookie);

    const response = await request(probe.app)
      .delete(SIGN_OUT_ROUTE)
      .set('Cookie', cookie)
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(before.status).toBe(HTTP_OK);
    expect(response.status).toBe(HTTP_NO_CONTENT);
    const cleared = String(sessionCookie(response));
    const attributes = cleared.split(';').map((part) => part.trim().toLowerCase());
    expect(attributes[0]).toBe(`${COOKIE_NAME}=`);
    expect(attributes).toEqual(expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'path=/', EPOCH_EXPIRY]));
    const after = await request(probe.app).get(PROBE_ROUTE).set('Cookie', cookie);
    const again = await request(probe.app)
      .delete(SIGN_OUT_ROUTE)
      .set('Cookie', cookie)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(after.status).toBe(HTTP_UNAUTHORIZED);
    expect(again.status).toBe(HTTP_UNAUTHORIZED);
    const { rows } = await database.pool.query<{ revoked_at: Date | null }>('SELECT revoked_at FROM sessions');
    expect(rows.map(({ revoked_at: value }) => value?.getTime())).toEqual([probe.clock.now().getTime()]);
  });

  it('revokes a native bearer session without X-Requested-With, and only that session', async () => {
    const probe = await createProbeApp();
    const now = probe.clock.now();
    const signedOut = await insertSession(database.pool, { createdAt: now });
    const otherDevice = await insertSession(database.pool, { createdAt: now, userId: signedOut.userId });

    const response = await request(probe.app)
      .delete(SIGN_OUT_ROUTE)
      .set('Authorization', `Bearer ${signedOut.sessionToken}`);
    const signedOutProbe = await request(probe.app)
      .get(PROBE_ROUTE)
      .set('Authorization', `Bearer ${signedOut.sessionToken}`);
    const otherProbe = await request(probe.app)
      .get(PROBE_ROUTE)
      .set('Authorization', `Bearer ${otherDevice.sessionToken}`);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(sessionCookie(response)).toBeUndefined();
    expect(signedOutProbe.status).toBe(HTTP_UNAUTHORIZED);
    expect(otherProbe.status).toBe(HTTP_OK);
    expect(await revokedAt(otherDevice.sessionId)).toBeNull();
  });

  it('refuses a cookie sign-out without X-Requested-With and leaves the session alive', async () => {
    const probe = await createProbeApp();
    const { sessionId, sessionToken } = await insertSession(database.pool, { createdAt: probe.clock.now() });
    const cookie = `${COOKIE_NAME}=${sessionToken}`;

    const response = await request(probe.app).delete(SIGN_OUT_ROUTE).set('Cookie', cookie);
    const stillAlive = await request(probe.app).get(PROBE_ROUTE).set('Cookie', cookie);

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(stillAlive.status).toBe(HTTP_OK);
    expect(await revokedAt(sessionId)).toBeNull();
  });

  it('answers a sign-out with no session with 401', async () => {
    const probe = await createProbeApp();

    const response = await request(probe.app).delete(SIGN_OUT_ROUTE).set('X-Requested-With', 'XMLHttpRequest');

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
  });
});
