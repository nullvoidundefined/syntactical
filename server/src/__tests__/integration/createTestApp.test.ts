// Pins the shared app helper's probe clock, fresh secrets, and optional router mounting.
import type pg from 'pg';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createTestApp } from '../integration/createTestApp.js';

describe('createTestApp', () => {
  it('mounts probe routes with the returned clock', async () => {
    const { app, clock } = createTestApp({
      extraRoutes(router, clock) {
        router.get('/probe', (_req, res) => res.json({ now: clock.now().toISOString() }));
      },
      pool: {} as pg.Pool,
    });

    const first = await request(app).get('/probe').expect(200);
    expect(first.body.now).toBe(clock.now().toISOString());
    clock.advance(60_000);
    const second = await request(app).get('/probe').expect(200);

    expect(second.body.now).toBe(clock.now().toISOString());
    expect(Date.parse(second.body.now) - Date.parse(first.body.now)).toBe(60_000);
  });

  it('generates fresh 32-byte hexadecimal secrets for each app', () => {
    const first = createTestApp({ pool: {} as pg.Pool });
    const second = createTestApp({ pool: {} as pg.Pool });

    for (const key of ['rateLimitKeySecret', 'revenueCatAuth'] as const) {
      expect(first[key]).toMatch(/^[0-9a-f]{64}$/);
      expect(second[key]).toMatch(/^[0-9a-f]{64}$/);
      expect(first[key]).not.toBe(second[key]);
    }
  });

  it('returns 404 for /v1/me when optional routers are omitted', async () => {
    const { app } = createTestApp({ pool: {} as pg.Pool });

    await request(app).get('/v1/me').expect(404);
  });
});
