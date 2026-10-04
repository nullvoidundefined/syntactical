// The app with its /v1/banks route wired to a real database for one integration test: a fixed
// clock the test reads (so it can insert live or expired sessions), the paid banks the test
// builds in memory, a silent logger, and the one allowed origin.
import type pg from 'pg';
import { pino } from 'pino';

import { createApp } from '../../app.js';
import type { PaidBanks } from '../../types/PaidBanks.js';

const ALLOWED_ORIGIN = 'https://syntactical.dev';

interface BanksTestAppOptions {
    paidBanks: PaidBanks;
    pool: pg.Pool;
}

export function createBanksTestApp(options: BanksTestAppOptions) {
    const { paidBanks, pool } = options;
    const fixedTime = Date.now();
    function now(): Date {
        return new Date(fixedTime);
    }
    const app = createApp({
        allowedOrigins: [ALLOWED_ORIGIN],
        banks: { database: pool, now, paidBanks },
        db: pool,
        logger: pino({ level: 'silent' }),
    });
    return { app, now };
}
