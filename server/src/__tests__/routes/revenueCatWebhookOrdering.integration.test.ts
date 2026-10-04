// B-39b (B-38, B-39, Review Focus 5): an entitlement follows the latest grant or revoke event by
// RevenueCat's event_timestamp_ms, never by arrival order; equal timestamps resolve to revoked.
// CANCELLATION and REFUND revoke. Concurrent deliveries of one event store one row, and
// concurrent purchase and refund deliveries still end on the later event. An event for one
// user never grants or revokes another user's entitlement.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const SETUP_TIMEOUT_MS = 120_000;
const DISTINCTIVE_BYTES = 12;
const CONCURRENCY_ROUNDS = 5;
const PURCHASE_TIMESTAMP_MS = 1_790_000_000_000;
const LATER_TIMESTAMP_MS = PURCHASE_TIMESTAMP_MS + 3_600_000;
const PAID_PRODUCT_ID = 'syntactical.python.full';
const paidProductIds: ReadonlySet<string> = new Set([PAID_PRODUCT_ID]);
const REVOKING_TYPES = ['CANCELLATION', 'REFUND'];

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>['app'];

function distinctive(): string {
    return randomBytes(DISTINCTIVE_BYTES).toString('hex');
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

async function insertUser(): Promise<string> {
    const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
        `learner-${randomUUID()}@example.com`,
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

// The (user, product) entitlement status, or undefined when no row exists.
async function entitlementStatus(userId: string): Promise<string | undefined> {
    const { rows } = await database.pool.query<{ source: string; status: string }>(
        'SELECT status, source FROM entitlements WHERE user_id = $1 AND product_id = $2',
        [userId, PAID_PRODUCT_ID],
    );
    if (rows[0]) {
        expect(rows[0].source).toBe('revenuecat');
    }
    return rows[0]?.status;
}

async function countPurchaseEvents(): Promise<number> {
    const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM purchase_events');
    return Number(rows[0].count);
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat entitlement ordering (B-39b)', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it.each(REVOKING_TYPES)('revokes a granted entitlement on a later %s', async (type) => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const userId = await insertUser();

        const purchase = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId }));
        const statusAfterPurchase = await entitlementStatus(userId);
        const revoke = await deliver(
            app,
            revenueCatAuth,
            buildEvent({ app_user_id: userId, event_timestamp_ms: LATER_TIMESTAMP_MS, type }),
        );

        expect(purchase.body).toEqual({ data: { status: 'recorded' } });
        expect(revoke.status).toBe(HTTP_OK);
        expect(revoke.body).toEqual({ data: { status: 'recorded' } });
        expect(statusAfterPurchase).toBe('granted');
        expect(await entitlementStatus(userId)).toBe('revoked');
        expect(await countPurchaseEvents()).toBe(2);
    });

    describe('provider time, not arrival order (Review Focus 5)', () => {
        it('ends revoked when a later-stamped refund arrives before its earlier purchase', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userId = await insertUser();

            const refund = await deliver(
                app,
                revenueCatAuth,
                buildEvent({ app_user_id: userId, event_timestamp_ms: LATER_TIMESTAMP_MS, type: 'REFUND' }),
            );
            const purchase = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId }));

            expect(refund.body).toEqual({ data: { status: 'recorded' } });
            expect(purchase.body).toEqual({ data: { status: 'recorded' } });
            expect(await entitlementStatus(userId)).toBe('revoked');
        });

        it('ends revoked when the purchase arrives first and the later-stamped refund second', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userId = await insertUser();

            const purchase = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId }));
            const refund = await deliver(
                app,
                revenueCatAuth,
                buildEvent({ app_user_id: userId, event_timestamp_ms: LATER_TIMESTAMP_MS, type: 'REFUND' }),
            );

            expect(purchase.body).toEqual({ data: { status: 'recorded' } });
            expect(refund.body).toEqual({ data: { status: 'recorded' } });
            expect(await entitlementStatus(userId)).toBe('revoked');
        });

        it('ends granted when an earlier-stamped refund arrives after a later repurchase', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userId = await insertUser();

            const repurchase = await deliver(
                app,
                revenueCatAuth,
                buildEvent({ app_user_id: userId, event_timestamp_ms: LATER_TIMESTAMP_MS }),
            );
            const staleRefund = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId, type: 'REFUND' }));

            expect(repurchase.body).toEqual({ data: { status: 'recorded' } });
            expect(staleRefund.body).toEqual({ data: { status: 'recorded' } });
            expect(await entitlementStatus(userId)).toBe('granted');
        });

        it.each([
            ['purchase then refund', ['NON_RENEWING_PURCHASE', 'REFUND']],
            ['refund then purchase', ['REFUND', 'NON_RENEWING_PURCHASE']],
        ])('ends revoked on equal timestamps delivered %s', async (_label, types) => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userId = await insertUser();

            const bodies = [];
            for (const type of types) {
                bodies.push((await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId, type }))).body);
            }

            expect(bodies).toEqual([{ data: { status: 'recorded' } }, { data: { status: 'recorded' } }]);
            expect(await entitlementStatus(userId)).toBe('revoked');
        });
    });

    describe('concurrent deliveries', () => {
        it('stores one row when one event is delivered twice at once, and both answer 200', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userId = await insertUser();
            const event = buildEvent({ app_user_id: userId });

            const responses = await Promise.all([
                deliver(app, revenueCatAuth, event),
                deliver(app, revenueCatAuth, event),
            ]);

            expect(responses.map(({ status }) => status)).toEqual([HTTP_OK, HTTP_OK]);
            expect(responses.map(({ body }) => body.data?.status).sort()).toEqual(['duplicate', 'recorded']);
            expect(await countPurchaseEvents()).toBe(1);
            expect(await entitlementStatus(userId)).toBe('granted');
        });

        it('ends revoked for concurrent purchase and later-stamped refund deliveries, every round', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const outcomes: Array<string | undefined> = [];
            const answers: Array<string | undefined> = [];

            for (let round = 0; round < CONCURRENCY_ROUNDS; round += 1) {
                const userId = await insertUser();
                const responses = await Promise.all([
                    deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId })),
                    deliver(
                        app,
                        revenueCatAuth,
                        buildEvent({ app_user_id: userId, event_timestamp_ms: LATER_TIMESTAMP_MS, type: 'REFUND' }),
                    ),
                ]);
                answers.push(...responses.map(({ body }) => body.data?.status));
                outcomes.push(await entitlementStatus(userId));
            }

            expect(answers).toEqual(Array(CONCURRENCY_ROUNDS * 2).fill('recorded'));
            expect(outcomes).toEqual(Array(CONCURRENCY_ROUNDS).fill('revoked'));
            expect(await countPurchaseEvents()).toBe(CONCURRENCY_ROUNDS * 2);
        });
    });

    describe('one user never affects another', () => {
        it('grants only the user the event names', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userA = await insertUser();
            const userB = await insertUser();

            const response = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userB }));

            expect(response.body).toEqual({ data: { status: 'recorded' } });
            expect(await entitlementStatus(userB)).toBe('granted');
            expect(await entitlementStatus(userA)).toBeUndefined();
        });

        it("keeps user A's grant when user B's purchase is refunded", async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userA = await insertUser();
            const userB = await insertUser();

            const bodies = [
                (await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userA }))).body,
                (await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userB }))).body,
                (
                    await deliver(
                        app,
                        revenueCatAuth,
                        buildEvent({ app_user_id: userB, event_timestamp_ms: LATER_TIMESTAMP_MS, type: 'REFUND' }),
                    )
                ).body,
            ];

            expect(bodies).toEqual(Array(3).fill({ data: { status: 'recorded' } }));
            expect(await entitlementStatus(userA)).toBe('granted');
            expect(await entitlementStatus(userB)).toBe('revoked');
        });
    });
});
