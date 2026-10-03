// B-62a: liveness and readiness checks, mounted outside /v1.
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const DATABASE_FAILURE_DETAIL = 'connect ECONNREFUSED 10.0.0.9:5432';

const silentLogger = pino({ level: 'silent' });

function createThrowingDb() {
  return {
    query: vi.fn((_sql: string): Promise<unknown> => {
      throw new Error(DATABASE_FAILURE_DETAIL);
    }),
  };
}

function createReachableDb() {
  return {
    query: vi.fn(async (_sql: string): Promise<unknown> => ({ rows: [{ ready: 1 }] })),
  };
}

function createRejectingDb() {
  return {
    query: vi.fn(async (_sql: string): Promise<unknown> => {
      throw new Error(DATABASE_FAILURE_DETAIL);
    }),
  };
}

describe('health routes', () => {
  it('GET /health returns 200 { status: ok } without touching the database', async () => {
    const db = createThrowingDb();
    const app = createApp({ db, logger: silentLogger });

    const response = await request(app).get('/health');

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ status: 'ok' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('GET /health/ready returns 200 with database ok when the database answers', async () => {
    const db = createReachableDb();
    const app = createApp({ db, logger: silentLogger });

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('GET /health/ready returns 503 degraded when the database query rejects', async () => {
    const db = createRejectingDb();
    const app = createApp({ db, logger: silentLogger });

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(response.body).toMatchObject({ status: 'degraded' });
    expect(response.text).not.toContain(DATABASE_FAILURE_DETAIL);
  });

  it('GET /health/ready returns 503 degraded when the database query throws synchronously', async () => {
    const db = createThrowingDb();
    const app = createApp({ db, logger: silentLogger });

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(response.body).toMatchObject({ status: 'degraded' });
    expect(response.text).not.toContain(DATABASE_FAILURE_DETAIL);
  });
});
