// The app with the /v1/admin routes wired to a real database for one integration test, mounted
// beside the routes an admin grant must reach: the /v1 sync routes (GET /v1/me) and the RevenueCat
// webhook. One injectable clock serves every router, and the rate-limit key secret and webhook
// authorization value are generated at run time. The toggle manages the lifetime Pro product.
import type pg from 'pg';

import { createTestApp } from './createTestApp.js';
import type { AnswerKey } from '../../types/AnswerKey.js';

export const ADMIN_TEST_PRODUCTS = {
  ANNUAL: 'syntactical.pro.annual',
  LIFETIME: 'syntactical.pro.lifetime',
} as const;

interface AdminTestAppOptions {
  pool: pg.Pool;
}

export function createAdminTestApp(options: AdminTestAppOptions) {
  const { pool } = options;
  const answerKey: AnswerKey = new Map();
  const { app, clock, rateLimitKeySecret, revenueCatAuth } = createTestApp({
    admin: true,
    pool,
    sync: { answerKey },
    webhooks: true,
  });
  return { app, clock, rateLimitKeySecret, revenueCatAuth };
}
