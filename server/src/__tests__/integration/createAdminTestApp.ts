// The app with the /v1/admin routes wired to a real database for one integration test, mounted
// beside the routes an admin grant must reach: the /v1 sync routes (GET /v1/me) and the
// RevenueCat webhook. One injectable clock serves every router, and the rate-limit key secret
// and webhook authorization value are generated at run time. The product ids handed to the admin
// and webhook routes are two legacy per-bank ids, as startServer passes LEGACY_PAID_PRODUCT_IDS.
import type pg from 'pg';

import { createTestApp } from './createTestApp.js';
import type { AnswerKey } from '../../types/AnswerKey.js';

export const ADMIN_TEST_PRODUCTS = {
  HARD: 'syntactical.python.hard',
  MEDIUM: 'syntactical.python.medium',
} as const;

interface AdminTestAppOptions {
  pool: pg.Pool;
}

export function createAdminTestApp(options: AdminTestAppOptions) {
  const { pool } = options;
  const paidProductIds: ReadonlySet<string> = new Set(Object.values(ADMIN_TEST_PRODUCTS));
  const answerKey: AnswerKey = new Map();
  const { app, clock, rateLimitKeySecret, revenueCatAuth } = createTestApp({
    admin: { paidProductIds },
    pool,
    sync: { answerKey },
    webhooks: { paidProductIds },
  });
  return { app, clock, paidProductIds, rateLimitKeySecret, revenueCatAuth };
}
