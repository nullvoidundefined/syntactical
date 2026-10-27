// The app wired to a real database for one integration test, with the parts every router
// shares built once: an injectable clock all mounted routers read, a silent logger, the one
// allowed origin, and the rate-limit key secret and webhook authorization value generated at
// run time. Each router is mounted only when its options are given; the per-router wrappers
// (createAuthTestApp and the others) adapt their option shapes onto this one.
import { randomBytes } from 'node:crypto';

import type { Router } from 'express';
import type pg from 'pg';
import { pino } from 'pino';
import type { Logger } from 'pino';

import { createApp } from '../../app.js';
import type { Database } from '../../clients/database.js';
import type { AskDeps } from '../../routes/askDeps.js';
import type { StudyNoteDeps } from '../../routes/studyNoteDeps.js';
import type { AuthDeps } from '../../routes/authDeps.js';
import type { AnswerKey } from '../../types/AnswerKey.js';

const SECRET_BYTES = 32;
const ALLOWED_ORIGIN = 'https://syntactical.dev';

export interface TestClock {
  advance(milliseconds: number): void;
  now(): Date;
}

interface TestAppOptions {
  // The /v1/admin routes, on `pool`, the clock, and the generated rate-limit key secret.
  admin?: { paidProductIds: ReadonlySet<string> };
  // The /v1/ask route, on `pool`, the clock, and the generated rate-limit key secret.
  ask?: Omit<AskDeps, 'database' | 'now' | 'rateLimitKeySecret'>;
  // The /v1/auth routes, on the clock and the generated rate-limit key secret; `database`
  // replaces `pool` for these routes only (health still uses `pool`), e.g. to make a query fail.
  auth?: Omit<AuthDeps, 'database' | 'now' | 'rateLimitKeySecret'> & { database?: Database };
  // Probe routes for one test, mounted after the routers; they get the test's clock.
  extraRoutes?: (router: Router, clock: TestClock) => void;
  logger?: Logger;
  pool: pg.Pool;
  // The /v1/study-note route, on `pool`, the clock, and the generated rate-limit key secret.
  studyNote?: Omit<StudyNoteDeps, 'database' | 'now' | 'rateLimitKeySecret'>;
  // The /v1 sync routes, on `pool`, the clock, and the generated rate-limit key secret.
  sync?: { answerKey: AnswerKey };
  // The RevenueCat webhook, on `pool`, the clock, and the generated authorization value. `true`
  // accepts SANDBOX events, as staging does, because the suites' events are SANDBOX.
  webhooks?: boolean | { acceptSandbox: boolean };
}

function createTestClock(): TestClock {
  let currentTime = Date.now();
  return {
    advance(milliseconds: number): void {
      currentTime += milliseconds;
    },
    now(): Date {
      return new Date(currentTime);
    },
  };
}

export function createTestApp(options: TestAppOptions) {
  const {
    admin,
    ask,
    auth,
    extraRoutes,
    logger = pino({ level: 'silent' }),
    pool,
    studyNote,
    sync,
    webhooks,
  } = options;
  const clock = createTestClock();
  const rateLimitKeySecret = randomBytes(SECRET_BYTES).toString('hex');
  const revenueCatAuth = randomBytes(SECRET_BYTES).toString('hex');
  const app = createApp({
    ...(admin ? { admin: { ...admin, database: pool, now: clock.now, rateLimitKeySecret } } : {}),
    allowedOrigins: [ALLOWED_ORIGIN],
    ...(ask ? { ask: { ...ask, database: pool, now: clock.now, rateLimitKeySecret } } : {}),
    ...(auth ? { auth: { ...auth, database: auth.database ?? pool, now: clock.now, rateLimitKeySecret } } : {}),
    db: pool,
    extraRoutes: extraRoutes ? (router: Router) => extraRoutes(router, clock) : undefined,
    logger,
    ...(studyNote ? { studyNote: { ...studyNote, database: pool, now: clock.now, rateLimitKeySecret } } : {}),
    ...(sync ? { sync: { ...sync, database: pool, now: clock.now, rateLimitKeySecret } } : {}),
    ...(webhooks
      ? {
          webhooks: {
            acceptSandbox: webhooks === true || webhooks.acceptSandbox,
            database: pool,
            now: clock.now,
            revenueCatAuth,
          },
        }
      : {}),
  });
  return { app, clock, rateLimitKeySecret, revenueCatAuth };
}
