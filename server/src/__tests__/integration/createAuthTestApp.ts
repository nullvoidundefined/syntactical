// The app with its auth routes wired to a real database for one integration
// test: an injectable clock, a recording email client, a rate-limit key secret
// generated at run time, a fake breach client (every range empty unless the
// test passes one), password hash slots, and an optional derivation wrapper.
import { randomBytes } from 'node:crypto';

import type { Router } from 'express';
import type pg from 'pg';
import { pino } from 'pino';
import type { Logger } from 'pino';

import { createApp } from '../../app.js';
import type { Database } from '../../clients/database.js';
import { createFakePasswordBreachClient } from '../../clients/fakePasswordBreachClient.js';
import type { PasswordBreachClient } from '../../clients/passwordBreachClient.js';
import { AUTH } from '../../constants/auth.js';
import type { DeriveKey } from '../../services/passwordHash.js';
import { createPasswordHashSlots } from '../../services/passwordHashSlots.js';

const SECRET_BYTES = 32;
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const DEFAULT_HASH_CONCURRENCY = 2;

interface SentCode {
    code: string;
    email: string;
}

interface TestClock {
    advance(milliseconds: number): void;
    now(): Date;
}

interface PasswordHashSlots {
    run<T>(task: () => Promise<T>): Promise<T>;
}

interface AuthTestAppOptions {
    // Replaces the pool for the auth routes only (health still uses `pool`), e.g. to make a query fail.
    database?: Database;
    // Wraps the scrypt derivation the auth routes use, to count or hold derivations.
    deriveKey?: DeriveKey;
    // Probe routes for one test, mounted after the auth routes; they get the test's clock.
    extraRoutes?: (router: Router, clock: TestClock) => void;
    isCookieSecure?: boolean;
    logger?: Logger;
    passwordBreachClient?: PasswordBreachClient;
    passwordHashSlots?: PasswordHashSlots;
    pool: pg.Pool;
    randomInt?: (min: number, max: number) => number;
    sendSignInCode?: (email: string, code: string) => Promise<void>;
}

export function createAuthTestApp(options: AuthTestAppOptions) {
    const {
        database,
        deriveKey,
        extraRoutes,
        isCookieSecure = true,
        logger = pino({ level: 'silent' }),
        passwordBreachClient = createFakePasswordBreachClient({}),
        passwordHashSlots = createPasswordHashSlots({
            concurrency: DEFAULT_HASH_CONCURRENCY,
            queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS,
        }),
        pool,
        randomInt,
        sendSignInCode,
    } = options;
    let currentTime = Date.now();
    const clock: TestClock = {
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
        auth: {
            database: database ?? pool,
            ...(deriveKey ? { deriveKey } : {}),
            emailClient,
            isCookieSecure,
            now: clock.now,
            passwordBreachClient,
            passwordHashSlots,
            randomInt,
            rateLimitKeySecret,
        },
        db: pool,
        extraRoutes: extraRoutes ? (router: Router) => extraRoutes(router, clock) : undefined,
        logger,
    });
    return { app, clock, passwordBreachClient, rateLimitKeySecret, sentCodes };
}
