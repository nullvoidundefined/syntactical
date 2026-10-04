// The app with the RevenueCat webhook mounted against a real database for one integration
// test: a fixed clock, the paid product ids the test names, and the webhook authorization
// value generated at run time and returned. Every line the app logs, at every level and with
// no redaction applied, is captured so a test can prove a value never reached the log.
import { randomBytes } from 'node:crypto';

import type pg from 'pg';
import { pino } from 'pino';

import { createApp } from '../../app.js';

const SECRET_BYTES = 32;
const ALLOWED_ORIGIN = 'https://syntactical.dev';

interface WebhookTestAppOptions {
    paidProductIds: ReadonlySet<string>;
    pool: pg.Pool;
}

export function createWebhookTestApp(options: WebhookTestAppOptions) {
    const { paidProductIds, pool } = options;
    const fixedTime = Date.now();
    function now(): Date {
        return new Date(fixedTime);
    }
    const revenueCatAuth = randomBytes(SECRET_BYTES).toString('hex');
    const logLines: string[] = [];
    const logger = pino(
        { level: 'trace' },
        {
            write(chunk: string) {
                logLines.push(chunk);
            },
        },
    );
    const app = createApp({
        allowedOrigins: [ALLOWED_ORIGIN],
        db: pool,
        logger,
        webhooks: { database: pool, now, paidProductIds, revenueCatAuth },
    });
    return { app, logLines, now, revenueCatAuth };
}
