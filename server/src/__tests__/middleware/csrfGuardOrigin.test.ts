// B-3.5 review fix (B-63): X-Requested-With alone is not the whole CSRF guard. A
// cookie-authenticated state change whose Origin header is present must name an allowed
// origin, so a request from another origin that somehow carries the header is still refused.
// No Origin (same-origin tools, older clients) passes on the header; bearer requests stay exempt.
import type { Router } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const PROBE_ROUTE = '/test/state';
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const SESSION_COOKIE = 'syntactical_session=opaque-session-value';
const CSRF_CODE = 'CSRF_HEADER_MISSING';

function createProbeApp(allowedOrigins = [ALLOWED_ORIGIN]) {
  const db = { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) };
  return createApp({
    allowedOrigins,
    db,
    extraRoutes(router: Router) {
      router.post(PROBE_ROUTE, (_req, res) => {
        res.status(HTTP_OK).json({ data: { ok: true } });
      });
    },
    logger: pino({ level: 'silent' }),
  });
}

function cookiePost(origin?: string, allowedOrigins?: string[]) {
  const pending = request(createProbeApp(allowedOrigins))
    .post(PROBE_ROUTE)
    .set('Cookie', SESSION_COOKIE)
    .set('X-Requested-With', 'XMLHttpRequest');
  return (origin === undefined ? pending : pending.set('Origin', origin)).send({});
}

describe('csrfGuard origin check', () => {
  it('refuses a cookie-authenticated state change from a disallowed or null Origin, header or not', async () => {
    const evil = await cookiePost('https://evil.example');
    const lookAlike = await cookiePost('https://syntactical.dev.evil.example');
    const nullOrigin = await cookiePost('null');

    for (const response of [evil, lookAlike, nullOrigin]) {
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.body.error.code).toBe(CSRF_CODE);
    }
  });

  it('passes the allowed Origin, a missing Origin, and a bearer request from any Origin', async () => {
    const allowed = await cookiePost(ALLOWED_ORIGIN);
    const noOrigin = await cookiePost();
    const bearer = await request(createProbeApp())
      .post(PROBE_ROUTE)
      .set('Cookie', SESSION_COOKIE)
      .set('Authorization', 'Bearer opaque-native-value')
      .set('Origin', 'https://evil.example')
      .send({});

    expect([allowed.status, noOrigin.status, bearer.status]).toEqual([HTTP_OK, HTTP_OK, HTTP_OK]);
  });

  it('never treats a listed null or * as an allowed Origin', async () => {
    const allowList = [ALLOWED_ORIGIN, 'null', '*'];

    const nullOrigin = await cookiePost('null', allowList);
    const wildcardOrigin = await cookiePost('*', allowList);
    const allowed = await cookiePost(ALLOWED_ORIGIN, allowList);

    for (const response of [nullOrigin, wildcardOrigin]) {
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.body.error.code).toBe(CSRF_CODE);
    }
    expect(allowed.status).toBe(HTTP_OK);
  });
});
