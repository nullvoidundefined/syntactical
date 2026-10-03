// B-3.3 and B-30: state-changing requests carry JSON or no body. A cross-site form can send
// text/plain, urlencoded, or multipart without a CORS preflight, so those get 415 on every
// non-GET route except the webhooks, which authenticate by their own header.
import type { Router } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';

const HTTP_OK = 200;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const ECHO_ROUTE = '/test/echo';
const WEBHOOK_ROUTE = '/v1/webhooks/test';
const UNSUPPORTED_CODE = 'INPUT_UNSUPPORTED_MEDIA_TYPE';

function createEchoApp() {
  const db = { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) };
  function echo(_req: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    res.status(HTTP_OK).json({ data: { ok: true } });
  }
  return createApp({
    db,
    extraRoutes(router: Router) {
      router.all(ECHO_ROUTE, echo);
      router.post(WEBHOOK_ROUTE, echo);
    },
    logger: pino({ level: 'silent' }),
  });
}

describe('requireJson', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)('rejects a text/plain %s with 415', async (method) => {
    const response = await request(createEchoApp())
      [method](ECHO_ROUTE)
      .set('Content-Type', 'text/plain')
      .send('{"email":"a@example.com"}');

    expect(response.status).toBe(HTTP_UNSUPPORTED_MEDIA_TYPE);
    expect(response.body.error.code).toBe(UNSUPPORTED_CODE);
  });

  it('rejects urlencoded and multipart bodies with 415', async () => {
    const app = createEchoApp();

    const form = await request(app).post(ECHO_ROUTE).type('form').send({ email: 'a@example.com' });
    const multipart = await request(app).post(ECHO_ROUTE).field('email', 'a@example.com');

    expect(form.status).toBe(HTTP_UNSUPPORTED_MEDIA_TYPE);
    expect(multipart.status).toBe(HTTP_UNSUPPORTED_MEDIA_TYPE);
  });

  it('passes application/json with a charset and a bodyless DELETE with no Content-Type', async () => {
    const app = createEchoApp();

    const json = await request(app)
      .post(ECHO_ROUTE)
      .set('Content-Type', 'application/json; charset=utf-8')
      .send('{"email":"a@example.com"}');
    const bodylessDelete = await request(app).delete(ECHO_ROUTE);

    expect(json.status).toBe(HTTP_OK);
    expect(bodylessDelete.status).toBe(HTTP_OK);
  });

  it('rejects a body sent with no Content-Type', async () => {
    const response = await request(createEchoApp())
      .post(ECHO_ROUTE)
      .set('Content-Length', '2')
      .send(Buffer.from('{}'))
      .unset('Content-Type');

    expect(response.status).toBe(HTTP_UNSUPPORTED_MEDIA_TYPE);
  });

  it('leaves GET and the webhook routes alone', async () => {
    const app = createEchoApp();

    const get = await request(app).get(ECHO_ROUTE).set('Content-Type', 'text/plain');
    const webhook = await request(app).post(WEBHOOK_ROUTE).set('Content-Type', 'text/plain').send('{}');

    expect(get.status).toBe(HTTP_OK);
    expect(webhook.status).toBe(HTTP_OK);
  });
});
