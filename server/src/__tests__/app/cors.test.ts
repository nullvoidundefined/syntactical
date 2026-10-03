// B-62b: CORS fails closed. Only an exact origin in allowedOrigins gets a credentialed grant;
// every other origin, an empty list, `*`, and `null` get no CORS grant headers at all.
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';

const ALLOWED_ORIGIN = 'https://syntactical.dev';
const OTHER_ORIGIN = 'https://evil.example';
const WILDCARD = '*';
const NULL_ORIGIN = 'null';
const PROBE_ROUTE = '/health';

const silentLogger = pino({ level: 'silent' });

function createCorsApp(allowedOrigins: string[]) {
  const db = { query: async (_sql: string): Promise<unknown> => ({ rows: [{ ready: 1 }] }) };
  return createApp({ allowedOrigins, db, logger: silentLogger });
}

async function simpleRequest(app: ReturnType<typeof createApp>, origin: string) {
  return request(app).get(PROBE_ROUTE).set('Origin', origin);
}

async function preflightRequest(app: ReturnType<typeof createApp>, origin: string) {
  return request(app)
    .options(PROBE_ROUTE)
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'content-type,x-requested-with');
}

function expectNoCorsGrant(response: request.Response) {
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
  expect(response.headers['access-control-allow-credentials']).toBeUndefined();
}

describe('CORS allowlist', () => {
  it('grants only the exact allowlisted origin, with credentials, and nothing to another origin', async () => {
    const app = createCorsApp([ALLOWED_ORIGIN]);

    const allowed = await simpleRequest(app, ALLOWED_ORIGIN);
    const allowedPreflight = await preflightRequest(app, ALLOWED_ORIGIN);
    const other = await simpleRequest(app, OTHER_ORIGIN);

    expect(allowed.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowedPreflight.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(allowedPreflight.headers['access-control-allow-credentials']).toBe('true');
    expectNoCorsGrant(other);
  });

  it('gives a disallowed origin no CORS grant on a preflight', async () => {
    const app = createCorsApp([ALLOWED_ORIGIN]);

    const response = await preflightRequest(app, OTHER_ORIGIN);

    expectNoCorsGrant(response);
  });

  it('allows no origin when the list is empty', async () => {
    const app = createCorsApp([]);

    expectNoCorsGrant(await simpleRequest(app, ALLOWED_ORIGIN));
    expectNoCorsGrant(await preflightRequest(app, ALLOWED_ORIGIN));
  });

  it('never honors * in the list as a wildcard or as a literal origin', async () => {
    const app = createCorsApp([WILDCARD]);

    expectNoCorsGrant(await simpleRequest(app, OTHER_ORIGIN));
    expectNoCorsGrant(await simpleRequest(app, WILDCARD));
    expectNoCorsGrant(await preflightRequest(app, WILDCARD));
  });

  it('never grants the null origin, even when null is listed', async () => {
    const unlisted = createCorsApp([ALLOWED_ORIGIN]);
    const listed = createCorsApp([ALLOWED_ORIGIN, NULL_ORIGIN]);

    expectNoCorsGrant(await simpleRequest(unlisted, NULL_ORIGIN));
    expectNoCorsGrant(await simpleRequest(listed, NULL_ORIGIN));
    expectNoCorsGrant(await preflightRequest(listed, NULL_ORIGIN));
  });
});
