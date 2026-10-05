// The app with the /v1/admin routes wired to a real database for one integration test, mounted
// beside the routes an admin grant must reach: the /v1 paid bank route, the /v1 sync routes
// (GET /v1/me), and the RevenueCat webhook. One injectable clock serves every router, and the
// rate-limit key secret and webhook authorization value are generated at run time. The paid
// product ids handed to the admin and webhook routes come from the paid banks, as startServer
// derives them from the server manifest.
import { randomBytes } from 'node:crypto';

import type pg from 'pg';
import { pino } from 'pino';

import { createApp } from '../../app.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import type { PaidBank } from '../../types/PaidBank.js';
import type { PaidBanks } from '../../types/PaidBanks.js';

const SECRET_BYTES = 32;
const ALLOWED_ORIGIN = 'https://syntactical.dev';

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

interface TestClock {
  advance(milliseconds: number): void;
  now(): Date;
}

interface AdminTestAppOptions {
  pool: pg.Pool;
}

export function createAdminTestApp(options: AdminTestAppOptions) {
  const { pool } = options;
  let currentTime = Date.now();
  const clock: TestClock = {
    advance(milliseconds: number): void {
      currentTime += milliseconds;
    },
    now(): Date {
      return new Date(currentTime);
    },
  };
  const paidBanks = buildPaidBanks();
  const paidProductIds: ReadonlySet<string> = new Set([...paidBanks.values()].map(({ productId }) => productId));
  const rateLimitKeySecret = randomBytes(SECRET_BYTES).toString('hex');
  const revenueCatAuth = randomBytes(SECRET_BYTES).toString('hex');
  const answerKey: AnswerKey = new Map();
  const app = createApp({
    admin: { database: pool, now: clock.now, paidProductIds, rateLimitKeySecret },
    allowedOrigins: [ALLOWED_ORIGIN],
    banks: { database: pool, now: clock.now, paidBanks },
    db: pool,
    logger: pino({ level: 'silent' }),
    sync: { answerKey, database: pool, now: clock.now, rateLimitKeySecret },
    webhooks: { database: pool, now: clock.now, paidProductIds, revenueCatAuth },
  });
  return { app, clock, paidProductIds, rateLimitKeySecret, revenueCatAuth };
}
