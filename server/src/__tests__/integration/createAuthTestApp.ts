// The app with its auth routes wired to a real database for one integration
// test: an injectable clock, a recording email client, and a rate-limit key
// secret generated at run time.
import { randomBytes } from 'node:crypto';

import type pg from 'pg';
import { pino } from 'pino';
import type { Logger } from 'pino';

import { createApp } from '../../app.js';

const SECRET_BYTES = 32;
const ALLOWED_ORIGIN = 'https://syntactical.dev';

interface SentCode {
    code: string;
    email: string;
}

interface AuthTestAppOptions {
    isCookieSecure?: boolean;
    logger?: Logger;
    pool: pg.Pool;
    randomInt?: (min: number, max: number) => number;
    sendSignInCode?: (email: string, code: string) => Promise<void>;
}

export function createAuthTestApp(options: AuthTestAppOptions) {
    const { isCookieSecure = true, logger = pino({ level: 'silent' }), pool, randomInt, sendSignInCode } = options;
    let currentTime = Date.now();
    const clock = {
        advance(milliseconds: number): void {
            currentTime += milliseconds;
        },
        now(): Date {
            return new Date(currentTime);
        },
    };
    const sentCodes: SentCode[] = [];
    const rateLimitKeySecret = randomBytes(SECRET_BYTES).toString('hex');
    const emailClient = {
        async sendSignInCode(email: string, code: string): Promise<void> {
            if (sendSignInCode) {
                await sendSignInCode(email, code);
            }
            sentCodes.push({ code, email });
        },
    };
    const app = createApp({
        allowedOrigins: [ALLOWED_ORIGIN],
        auth: { database: pool, emailClient, isCookieSecure, now: clock.now, randomInt, rateLimitKeySecret },
        db: pool,
        logger,
    });
    return { app, clock, rateLimitKeySecret, sentCodes };
}
