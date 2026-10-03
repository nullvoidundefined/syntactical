// B-62a: request ids, the error response shape, the JSON body limit, and helmet headers.
import { pino } from 'pino';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const BYTES_PER_KB = 1024;
const JSON_BODY_LIMIT_KB = 10;
const OVERSIZED_BODY_BYTES = (JSON_BODY_LIMIT_KB + 1) * BYTES_PER_KB;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STACK_FRAME_PATTERN = /\n\s+at\s/;
const UNKNOWN_ROUTE = '/v1/no-such-route';

const silentLogger = pino({ level: 'silent' });

function createApiApp() {
  const db = { query: async (_sql: string): Promise<unknown> => ({ rows: [{ ready: 1 }] }) };
  return createApp({ db, logger: silentLogger });
}

function containsKeyDeep(value: unknown, key: string): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(value, key)) {
    return true;
  }
  return Object.values(value as Record<string, unknown>).some((child) => containsKeyDeep(child, key));
}

function expectErrorShape(response: request.Response) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(UUID_PATTERN);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.body).toEqual({
    error: {
      code: expect.any(String),
      message: expect.any(String),
      requestId,
    },
  });
  expect(response.body.error.code.length).toBeGreaterThan(0);
  expect(response.body.error.message.length).toBeGreaterThan(0);
  expect(containsKeyDeep(response.body, 'stack')).toBe(false);
  expect(response.text).not.toMatch(STACK_FRAME_PATTERN);
}

describe('app middleware and error handler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets a UUID X-Request-Id on every response, different per request', async () => {
    const app = createApiApp();

    const first = await request(app).get('/health');
    const second = await request(app).get('/health');
    const notFound = await request(app).get(UNKNOWN_ROUTE);

    expect(first.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(second.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(notFound.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('sets helmet headers', async () => {
    const app = createApiApp();

    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('answers an unknown route with 404 in the error shape and no stack in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = createApiApp();

    const response = await request(app).get(UNKNOWN_ROUTE);

    expect(response.status).toBe(HTTP_NOT_FOUND);
    expectErrorShape(response);
  });

  it('answers a JSON body over 10 kB with 413 in the error shape and no stack in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = createApiApp();
    const oversizedBody = JSON.stringify({ padding: 'a'.repeat(OVERSIZED_BODY_BYTES) });

    const response = await request(app)
      .post(UNKNOWN_ROUTE)
      .set('Content-Type', 'application/json')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(oversizedBody);

    expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
    expectErrorShape(response);
  });

  it('answers a malformed JSON body with 400 in the error shape and no stack in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = createApiApp();

    const response = await request(app)
      .post(UNKNOWN_ROUTE)
      .set('Content-Type', 'application/json')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send('{"unterminated":');

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expectErrorShape(response);
  });
});
