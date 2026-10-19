// The app with the /v1/admin routes wired to a real database for one integration test, mounted
// beside the routes an admin grant must reach: the /v1 paid bank route, the /v1 sync routes
// (GET /v1/me), and the RevenueCat webhook. One injectable clock serves every router, and the
// rate-limit key secret and webhook authorization value are generated at run time. The paid
// product ids handed to the admin and webhook routes come from the paid banks, as startServer
// derives them from the server manifest.
import type pg from 'pg';

import { createTestApp } from './createTestApp.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import type { PaidBank } from '../../types/PaidBank.js';
import type { PaidBanks } from '../../types/PaidBanks.js';

export const ADMIN_TEST_PRODUCTS = {
  HARD: 'syntactical.python.hard',
  MEDIUM: 'syntactical.python.medium',
} as const;

export const ADMIN_TEST_ROUTES = {
  HARD_BANK: '/v1/banks/python/hard',
  MEDIUM_BANK: '/v1/banks/python/medium',
} as const;

export const ADMIN_TEST_MARKERS = {
  HARD: 'admin-test-bank-marker-python-hard',
  MEDIUM: 'admin-test-bank-marker-python-medium',
} as const;

function bankFixture(difficulty: string, marker: string): Buffer {
  const document = { difficulty, language: 'python', marker, questions: [] };
  return Buffer.from(`${JSON.stringify(document)}\n`, 'utf8');
}

function buildPaidBanks(): PaidBanks {
  const medium: PaidBank = {
    body: bankFixture('medium', ADMIN_TEST_MARKERS.MEDIUM),
    productId: ADMIN_TEST_PRODUCTS.MEDIUM,
  };
  const hard: PaidBank = { body: bankFixture('hard', ADMIN_TEST_MARKERS.HARD), productId: ADMIN_TEST_PRODUCTS.HARD };
  return new Map<string, PaidBank>([
    ['python/medium', medium],
    ['python/hard', hard],
  ]);
}

interface AdminTestAppOptions {
  pool: pg.Pool;
}

export function createAdminTestApp(options: AdminTestAppOptions) {
  const { pool } = options;
  const paidBanks = buildPaidBanks();
  const paidProductIds: ReadonlySet<string> = new Set([...paidBanks.values()].map(({ productId }) => productId));
  const answerKey: AnswerKey = new Map();
  const { app, clock, rateLimitKeySecret, revenueCatAuth } = createTestApp({
    admin: { paidProductIds },
    banks: { paidBanks },
    pool,
    sync: { answerKey },
    webhooks: { paidProductIds },
  });
  return { app, clock, paidProductIds, rateLimitKeySecret, revenueCatAuth };
}
