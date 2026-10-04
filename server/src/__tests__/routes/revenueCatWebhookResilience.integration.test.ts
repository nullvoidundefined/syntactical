// B-39c (B-38, B-39, security section): resilience of POST /v1/webhooks/revenuecat.
// A delivery that waits on a user row another transaction holds FOR UPDATE (as account deletion
// would) answers 503 with Retry-After within a few seconds, stores nothing, and records on
// redelivery once the lock is released. product_id and store must be non-empty and at most 200
// characters, app_user_id at most 200, else 400 INPUT_INVALID_BODY with nothing stored. The
// unmapped-product warning carries the request's requestId, the same id as X-Request-Id.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETUP_TIMEOUT_MS = 120_000;
const LOCK_TEST_TIMEOUT_MS = 30_000;
const BOUNDED_WAIT_MS = 5_000;
const DISTINCTIVE_BYTES = 12;
const FIELD_LIMIT = 200;
const PINO_WARN_LEVEL = 40;
const PURCHASE_TIMESTAMP_MS = 1_790_000_000_000;
const PAID_PRODUCT_ID = 'syntactical.python.full';
const UNMAPPED_PRODUCT_ID = 'syntactical.unknown.bank';
const paidProductIds: ReadonlySet<string> = new Set([PAID_PRODUCT_ID]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>['app'];

function distinctive(): string {
    return randomBytes(DISTINCTIVE_BYTES).toString('hex');
}

function runTimeEmail(): string {
    return `learner-${distinctive()}@example.com`;
}

function buildEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        app_user_id: randomUUID(),
        environment: 'SANDBOX',
        event_timestamp_ms: PURCHASE_TIMESTAMP_MS,
        id: randomUUID(),
        product_id: PAID_PRODUCT_ID,
        store: 'APP_STORE',
        transaction_id: distinctive(),
        type: 'NON_RENEWING_PURCHASE',
        ...overrides,
    };
}

async function insertUser(email: string = runTimeEmail()): Promise<string> {
    const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
        email,
    ]);
    return rows[0].id;
}

function deliver(app: TestApp, authorization: string, event: Record<string, unknown>) {
    return request(app)
        .post(ROUTE)
        .set('Authorization', authorization)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ event }));
}

async function countPurchaseEvents(): Promise<number> {
    const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM purchase_events');
    return Number(rows[0].count);
}

async function entitlementStatus(userId: string): Promise<string | undefined> {
    const { rows } = await database.pool.query<{ status: string }>(
        'SELECT status FROM entitlements WHERE user_id = $1 AND product_id = $2',
        [userId, PAID_PRODUCT_ID],
    );
    return rows[0]?.status;
}

function flushLogs(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat resilience (B-39c)', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it(
        'answers 503 with Retry-After within a few seconds while the user row is held FOR UPDATE, then records on redelivery',
        async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({
                paidProductIds,
                pool: database.pool,
            });
            const userId = await insertUser();
            const event = buildEvent({ app_user_id: userId });
            const locker = await database.pool.connect();
            let outcome: request.Response | 'still waiting';
            let elapsedMs: number;
            let eventsWhileLocked: number;
            let pending: Promise<request.Response>;
            try {
                await locker.query('BEGIN');
                await locker.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
                const startedAt = Date.now();
                pending = Promise.resolve(deliver(app, revenueCatAuth, event));
                outcome = await Promise.race([pending, pause(BOUNDED_WAIT_MS).then(() => 'still waiting' as const)]);
                elapsedMs = Date.now() - startedAt;
                eventsWhileLocked = await countPurchaseEvents();
            } finally {
                await locker.query('ROLLBACK');
                locker.release();
            }
            await pending.catch(() => undefined);

            const redelivered = await deliver(app, revenueCatAuth, event);

            expect(outcome).not.toBe('still waiting');
            if (outcome === 'still waiting') {
                return;
            }
            expect(outcome.status).toBe(HTTP_SERVICE_UNAVAILABLE);
            expect(outcome.headers['retry-after']).toMatch(/^\d+$/);
            expect(elapsedMs).toBeLessThan(BOUNDED_WAIT_MS);
            expect(eventsWhileLocked).toBe(0);
            expect(redelivered.status).toBe(HTTP_OK);
            expect(redelivered.body).toEqual({ data: { status: 'recorded' } });
            expect(await entitlementStatus(userId)).toBe('granted');
        },
        LOCK_TEST_TIMEOUT_MS,
    );

    describe('bounded event fields', () => {
        const overLimit = 'x'.repeat(FIELD_LIMIT + 1);
        const invalidFields: Array<[string, Record<string, unknown>]> = [
            ['an empty product_id', { product_id: '' }],
            [`a product_id longer than ${FIELD_LIMIT} characters`, { product_id: overLimit }],
            ['an empty store', { store: '' }],
            [`an app_user_id longer than ${FIELD_LIMIT} characters`, { app_user_id: overLimit }],
        ];

        it.each(invalidFields)(
            'answers an event with %s with 400 INPUT_INVALID_BODY and stores nothing',
            async (_label, overrides) => {
                const { app, revenueCatAuth } = createWebhookTestApp({
                    paidProductIds,
                    pool: database.pool,
                });

                const response = await deliver(app, revenueCatAuth, buildEvent(overrides));

                expect(response.status).toBe(HTTP_BAD_REQUEST);
                expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
                expect(await countPurchaseEvents()).toBe(0);
            },
        );
    });

    it("carries the request's requestId, matching X-Request-Id, on the unmapped-product warning", async () => {
        const { app, logLines, revenueCatAuth } = createWebhookTestApp({
            paidProductIds,
            pool: database.pool,
        });
        const userId = await insertUser();

        const response = await deliver(
            app,
            revenueCatAuth,
            buildEvent({ app_user_id: userId, product_id: UNMAPPED_PRODUCT_ID }),
        );
        await flushLogs();

        expect(response.body).toEqual({ data: { status: 'recorded' } });
        const requestId = response.headers['x-request-id'];
        expect(requestId).toEqual(expect.any(String));
        const warnings = logLines
            .map(
                (line) =>
                    JSON.parse(line) as {
                        level: number;
                        reason?: string;
                        requestId?: string;
                    },
            )
            .filter((line) => line.level === PINO_WARN_LEVEL && line.reason === 'unmapped_product');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].requestId).toBe(requestId);
    });
});
