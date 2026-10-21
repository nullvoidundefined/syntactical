// The app with its /v1 sync routes wired to a real database for one integration test: a
// fixed clock the test reads, the answer key the test builds, and a rate-limit key secret
// generated at run time, returned so a test can compute a rate_limit_counters key.
import type pg from 'pg';

import { createTestApp } from './createTestApp.js';
import type { AnswerKey } from '../../types/AnswerKey.js';

interface SyncTestAppOptions {
  answerKey: AnswerKey;
  pool: pg.Pool;
}

export function createSyncTestApp(options: SyncTestAppOptions) {
  const { answerKey, pool } = options;
  const { app, clock, rateLimitKeySecret } = createTestApp({ pool, sync: { answerKey } });
  return { app, now: clock.now, rateLimitKeySecret };
}
