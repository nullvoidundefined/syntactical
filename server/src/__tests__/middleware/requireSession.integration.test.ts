// B-3.5 (B-29): requireSession accepts a valid syntactical_session cookie or a valid
// Authorization: Bearer token, looked up by SHA-256 only. The bearer token decides when both
// are sent. Unknown, revoked, absolutely expired (30 days), and idle (14 days) sessions all
// get the same 401, and each accepted request moves last_used_at forward.
import { createHash } from 'node:crypto';

import type { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const PROBE_ROUTE = '/test/session';
const COOKIE_NAME = 'syntactical_session';
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const IDLE_DAYS = 14;
const TEN_DAYS_MS = 864_000_000;
const SESSION_REQUIRED = 'AUTH_SESSION_REQUIRED';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function createProbeApp() {
  const { createRequireSession } = await import('../../middleware/requireSession.js');
  return createAuthTestApp({
    extraRoutes(router: Router, clock) {
      router.get(PROBE_ROUTE, createRequireSession({ database: database.pool, now: clock.now }), (_req, res) => {
        const { session } = res.locals as { session: { transport: string; userId: string } };
        res.status(HTTP_OK).json({ data: { transport: session.transport, userId: session.userId } });
      });
    },
    pool: database.pool,
  });
}

type ProbeApp = Awaited<ReturnType<typeof createProbeApp>>;

function withCookie({ app }: ProbeApp, sessionToken: string) {
  return request(app).get(PROBE_ROUTE).set('Cookie', `${COOKIE_NAME}=${sessionToken}`);
}

function withBearer({ app }: ProbeApp, sessionToken: string) {
  return request(app).get(PROBE_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

function errorShape(response: request.Response) {
  const { code, message } = (response.body as { error: { code: string; message: string } }).error;
  return { code, message, status: response.status };
}

describe.skipIf(SKIP_DATABASE_TESTS)('requireSession', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('authenticates a valid cookie and a valid bearer token', async () => {
    const probe = await createProbeApp();
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: probe.clock.now() });

    const byCookie = await withCookie(probe, sessionToken);
    const byBearer = await withBearer(probe, sessionToken);

    expect(byCookie.status).toBe(HTTP_OK);
    expect(byCookie.body).toEqual({ data: { transport: 'cookie', userId } });
    expect(byBearer.status).toBe(HTTP_OK);
    expect(byBearer.body).toEqual({ data: { transport: 'bearer', userId } });
  });

  it('lets the bearer token decide when both are sent, even when the bearer token fails', async () => {
    const probe = await createProbeApp();
    const now = probe.clock.now();
    const cookieSession = await insertSession(database.pool, { createdAt: now });
    const bearerSession = await insertSession(database.pool, { createdAt: now });
    const revoked = await insertSession(database.pool, { createdAt: now, revokedAt: now });

    const bothValid = await withCookie(probe, cookieSession.sessionToken).set(
      'Authorization',
      `Bearer ${bearerSession.sessionToken}`,
    );
    const failingBearer = await withCookie(probe, cookieSession.sessionToken).set(
      'Authorization',
      `Bearer ${revoked.sessionToken}`,
    );
    const malformedBearer = await withCookie(probe, cookieSession.sessionToken).set(
      'Authorization',
      `Basic ${cookieSession.sessionToken}`,
    );
    const emptyBearer = await withCookie(probe, cookieSession.sessionToken).set('Authorization', 'Bearer ');

    expect(bothValid.body).toEqual({ data: { transport: 'bearer', userId: bearerSession.userId } });
    expect(failingBearer.status).toBe(HTTP_UNAUTHORIZED);
    expect(malformedBearer.status).toBe(HTTP_UNAUTHORIZED);
    expect(emptyBearer.status).toBe(HTTP_UNAUTHORIZED);
  });

  it('answers missing, unknown, revoked, absolute-expired, and idle-expired tokens with one 401 body', async () => {
    const probe = await createProbeApp();
    const now = probe.clock.now();
    const revoked = await insertSession(database.pool, { createdAt: now, revokedAt: now });
    const absoluteExpired = await insertSession(database.pool, { createdAt: now, expiresAt: now });
    const idle = await insertSession(database.pool, {
      createdAt: new Date(now.getTime() - IDLE_DAYS * DAY_MS),
      lastUsedAt: new Date(now.getTime() - IDLE_DAYS * DAY_MS),
    });
    const unknownToken = createHash('sha256').update(revoked.sessionToken).digest('base64url');

    const responses = [
      await request(probe.app).get(PROBE_ROUTE),
      await withBearer(probe, unknownToken),
      await withCookie(probe, unknownToken),
      await withBearer(probe, revoked.sessionToken),
      await withCookie(probe, revoked.sessionToken),
      await withBearer(probe, absoluteExpired.sessionToken),
      await withCookie(probe, absoluteExpired.sessionToken),
      await withBearer(probe, idle.sessionToken),
      await withCookie(probe, idle.sessionToken),
    ];

    const shapes = responses.map(errorShape);
    expect(shapes[0]).toEqual({ code: SESSION_REQUIRED, message: expect.any(String), status: HTTP_UNAUTHORIZED });
    for (const shape of shapes) {
      expect(shape).toEqual(shapes[0]);
    }
  });

  it('keeps a session used within 14 days alive and moves last_used_at to now', async () => {
    const probe = await createProbeApp();
    const start = probe.clock.now();
    const { sessionId, sessionToken } = await insertSession(database.pool, { createdAt: start });

    probe.clock.advance(IDLE_DAYS * DAY_MS - MINUTE_MS);
    const nearlyIdle = await withBearer(probe, sessionToken);

    expect(nearlyIdle.status).toBe(HTTP_OK);
    const { rows } = await database.pool.query<{ last_used_at: Date }>(
      'SELECT last_used_at FROM sessions WHERE id = $1',
      [sessionId],
    );
    const [{ last_used_at: lastUsedAt }] = rows;
    expect(lastUsedAt.getTime()).toBe(probe.clock.now().getTime());
  });

  it('ends a session 30 days after creation however recently it was used', async () => {
    const probe = await createProbeApp();
    const { sessionToken } = await insertSession(database.pool, { createdAt: probe.clock.now() });

    probe.clock.advance(TEN_DAYS_MS);
    const atTenDays = await withBearer(probe, sessionToken);
    probe.clock.advance(TEN_DAYS_MS);
    const atTwentyDays = await withBearer(probe, sessionToken);
    probe.clock.advance(TEN_DAYS_MS - MINUTE_MS);
    const justBeforeThirtyDays = await withBearer(probe, sessionToken);
    probe.clock.advance(MINUTE_MS);
    const atThirtyDays = await withBearer(probe, sessionToken);

    expect([atTenDays.status, atTwentyDays.status, justBeforeThirtyDays.status]).toEqual([HTTP_OK, HTTP_OK, HTTP_OK]);
    expect(atThirtyDays.status).toBe(HTTP_UNAUTHORIZED);
  });
});
