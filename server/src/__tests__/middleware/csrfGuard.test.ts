// B-3.5 (B-63): a cookie-authenticated POST, PUT, PATCH, or DELETE without
// X-Requested-With: XMLHttpRequest gets 403. A cross-site page cannot add that header without
// a CORS preflight, which the exact-origin allowlist refuses. Requests carrying no session
// cookie, bearer-authenticated native requests, reads, and the webhook routes are exempt.
import type { Router } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const PROBE_ROUTE = '/test/state';
const WEBHOOK_ROUTE = '/v1/webhooks/test';
const COOKIE_NAME = 'syntactical_session';
const CSRF_CODE = 'CSRF_HEADER_MISSING';
const SESSION_COOKIE = `${COOKIE_NAME}=opaque-session-value`;

function createProbeApp() {
  const db = { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) };
  function ok(_req: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    res.status(HTTP_OK).json({ data: { ok: true } });
  }
  return createApp({
    db,
    extraRoutes(router: Router) {
      router.all(PROBE_ROUTE, ok);
      router.post(WEBHOOK_ROUTE, ok);
    },
    logger: pino({ level: 'silent' }),
  });
}

describe('csrfGuard', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'rejects a cookie-authenticated %s without X-Requested-With with 403',
    async (method) => {
      const response = await request(createProbeApp())[method](PROBE_ROUTE).set('Cookie', SESSION_COOKIE).send({});

      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.body.error.code).toBe(CSRF_CODE);
    },
  );

  it('rejects a cookie-authenticated POST whose X-Requested-With is not XMLHttpRequest', async () => {
    const response = await request(createProbeApp())
      .post(PROBE_ROUTE)
      .set('Cookie', SESSION_COOKIE)
      .set('X-Requested-With', 'fetch')
      .send({});

    expect(response.status).toBe(HTTP_FORBIDDEN);
  });

  it('passes a cookie-authenticated POST that carries X-Requested-With: XMLHttpRequest', async () => {
    const response = await request(createProbeApp())
      .post(PROBE_ROUTE)
      .set('Cookie', SESSION_COOKIE)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({});

    expect(response.status).toBe(HTTP_OK);
  });

  it('exempts reads, requests with no session cookie, bearer requests, and webhooks', async () => {
    const app = createProbeApp();

    const read = await request(app).get(PROBE_ROUTE).set('Cookie', SESSION_COOKIE);
    const noCookie = await request(app).post(PROBE_ROUTE).send({});
    const otherCookie = await request(app).post(PROBE_ROUTE).set('Cookie', 'theme=dark').send({});
    const bearer = await request(app)
      .post(PROBE_ROUTE)
      .set('Cookie', SESSION_COOKIE)
      .set('Authorization', 'Bearer opaque-native-value')
      .send({});
    const webhook = await request(app).post(WEBHOOK_ROUTE).set('Cookie', SESSION_COOKIE).send({});

    expect([read.status, noCookie.status, otherCookie.status, bearer.status, webhook.status]).toEqual([
      HTTP_OK,
      HTTP_OK,
      HTTP_OK,
      HTTP_OK,
      HTTP_OK,
    ]);
  });
});
