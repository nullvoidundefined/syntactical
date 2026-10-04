// The app with its /v1 sync routes wired to a real database for one integration test: a
// fixed clock the test reads, the answer key the test builds, and a rate-limit key secret
// generated at run time, returned so a test can compute a rate_limit_counters key.
import { randomBytes } from 'node:crypto';

import type pg from 'pg';
import { pino } from 'pino';

import { createApp } from '../../app.js';
import type { AnswerKey } from '../../types/AnswerKey.js';

const SECRET_BYTES = 32;
const ALLOWED_ORIGIN = 'https://syntactical.dev';

interface SyncTestAppOptions {
    answerKey: AnswerKey;
    pool: pg.Pool;
}

export function createSyncTestApp(options: SyncTestAppOptions) {
    const { answerKey, pool } = options;
    const fixedTime = Date.now();
    function now(): Date {
        return new Date(fixedTime);
    }
    const rateLimitKeySecret = randomBytes(SECRET_BYTES).toString('hex');
    const app = createApp({
        allowedOrigins: [ALLOWED_ORIGIN],
        db: pool,
        logger: pino({ level: 'silent' }),
        sync: { answerKey, database: pool, now, rateLimitKeySecret },
    });
    return { app, now, rateLimitKeySecret };
}
