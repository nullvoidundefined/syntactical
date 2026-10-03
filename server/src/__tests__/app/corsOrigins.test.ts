// B-3.5 (B-30): with the production allowlist, only https://syntactical.dev gets a credentialed
// CORS grant. Look-alike origins (a suffix domain, plain http, a different port) and null get
// none, on simple requests and on preflights; the allowed origin's preflight admits the
// headers the clients send (X-Requested-With, Content-Type, Authorization, X-Client).
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';

const ALLOWED_ORIGIN = 'https://syntactical.dev';
const PROBE_ROUTE = '/health';
const CLIENT_HEADERS = 'x-requested-with,content-type,authorization,x-client';

function createCorsApp() {
  const db = { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) };
  return createApp({ allowedOrigins: [ALLOWED_ORIGIN], db, logger: pino({ level: 'silent' }) });
}

function preflight(origin: string) {
  return request(createCorsApp())
    .options('/v1/auth/sessions/current')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'DELETE')
    .set('Access-Control-Request-Headers', CLIENT_HEADERS);
}

describe('CORS origins', () => {
  it.each(['https://evil.com', 'null', 'https://syntactical.dev.evil.com', 'http://syntactical.dev', 'https://syntactical.dev:8443'])(
    'grants %s nothing',
    async (origin) => {
      const simple = await request(createCorsApp()).get(PROBE_ROUTE).set('Origin', origin);
      const preflightResponse = await preflight(origin);

      for (const response of [simple, preflightResponse]) {
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
        expect(response.headers['access-control-allow-credentials']).toBeUndefined();
      }
    },
  );

  it('grants the allowed origin a credentialed preflight for DELETE with the client headers', async () => {
    const response = await preflight(ALLOWED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(String(response.headers['access-control-allow-methods'])).toContain('DELETE');
    const allowedHeaders = String(response.headers['access-control-allow-headers']).toLowerCase();
    for (const header of CLIENT_HEADERS.split(',')) {
      expect(allowedHeaders).toContain(header);
    }
  });
});
