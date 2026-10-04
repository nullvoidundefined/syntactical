// B-39b (B-38, B-39, security section): an authenticated RevenueCat NON_RENEWING_PURCHASE,
// CANCELLATION, or REFUND is recorded once as a purchase_events row (provider 'revenuecat', keyed
// by the event id, never updated on redelivery) and answers 200 recorded, or 200 duplicate when
// the id was seen before. The app user id names the row's user only when it is a UUID of an
// existing user. Only a product in paidProductIds, from APP_STORE, PLAY_STORE, or RC_BILLING,
// for a resolved user changes an entitlement; an unmapped product logs a warning naming no user.
// The stored payload is an allowlisted projection that holds no PII, and no log line carries
// the email, display name, app user id, or event id.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { readProfile } from '../../services/readProfile.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const SETUP_TIMEOUT_MS = 120_000;
const DISTINCTIVE_BYTES = 12;
const PINO_WARN_LEVEL = 40;
const BASE_TIMESTAMP_MS = 1_790_000_000_000;
const PAID_PRODUCT_ID = 'syntactical.python.full';
const UNMAPPED_PRODUCT_ID = 'syntactical.cobol.full';
const paidProductIds: ReadonlySet<string> = new Set([PAID_PRODUCT_ID]);
const GRANTING_STORES = ['APP_STORE', 'PLAY_STORE', 'RC_BILLING'];
const PAYLOAD_ALLOWLIST = new Set([
    'type',
    'store',
    'environment',
    'product_id',
    'event_timestamp_ms',
    'purchased_at_ms',
    'transaction_id',
    'original_transaction_id',
    'price',
    'currency',
    'cancel_reason',
    'period_type',
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>['app'];

interface PurchaseEventRow {
    kind: string;
    occurred_at: Date;
    payload: Record<string, unknown>;
    payload_text: string;
    product_id: string | null;
    provider: string;
    provider_event_id: string;
    user_id: string | null;
}

interface EntitlementRow {
    product_id: string;
    source: string;
    status: string;
    updated_at: Date;
    user_id: string | null;
}

function distinctive(): string {
    return randomBytes(DISTINCTIVE_BYTES).toString('hex');
}

// A RevenueCat-shaped event for the paid product from the App Store.
function buildEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        app_user_id: randomUUID(),
        environment: 'SANDBOX',
        event_timestamp_ms: BASE_TIMESTAMP_MS,
        id: randomUUID(),
        product_id: PAID_PRODUCT_ID,
        store: 'APP_STORE',
        transaction_id: distinctive(),
        type: 'NON_RENEWING_PURCHASE',
        ...overrides,
    };
}

async function insertUser(email = `learner-${randomUUID()}@example.com`): Promise<string> {
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

async function readPurchaseEvents(): Promise<PurchaseEventRow[]> {
    const { rows } = await database.pool.query<PurchaseEventRow>(
        `SELECT provider, provider_event_id, kind, product_id, user_id, occurred_at, payload,
                payload::text AS payload_text
         FROM purchase_events ORDER BY received_at, provider_event_id`,
    );
    return rows;
}

async function readEntitlements(): Promise<EntitlementRow[]> {
    const { rows } = await database.pool.query<EntitlementRow>(
        'SELECT user_id, product_id, source, status, updated_at FROM entitlements ORDER BY user_id, product_id',
    );
    return rows;
}

async function grantedProductIds(userId: string): Promise<string[]> {
    const profile = await readProfile(database.pool, userId, new Date());
    return profile?.entitlements ?? [];
}

function flushLogs(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat event recording (B-39b)', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    describe('a purchase of a paid product for an existing user', () => {
        it.each(GRANTING_STORES)(
            'from %s answers 200 recorded, stores one row, and grants the entitlement',
            async (store) => {
                const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
                const userId = await insertUser();
                const event = buildEvent({ app_user_id: userId, store });

                const response = await deliver(app, revenueCatAuth, event);

                expect(response.status).toBe(HTTP_OK);
                expect(response.body).toEqual({ data: { status: 'recorded' } });
                const rows = await readPurchaseEvents();
                expect(rows).toHaveLength(1);
                expect(rows[0]).toMatchObject({
                    kind: 'NON_RENEWING_PURCHASE',
                    product_id: PAID_PRODUCT_ID,
                    provider: 'revenuecat',
                    provider_event_id: event.id,
                    user_id: userId,
                });
                expect(rows[0].occurred_at.getTime()).toBe(BASE_TIMESTAMP_MS);
                const entitlements = await readEntitlements();
                expect(entitlements).toHaveLength(1);
                expect(entitlements[0]).toMatchObject({
                    product_id: PAID_PRODUCT_ID,
                    source: 'revenuecat',
                    status: 'granted',
                    user_id: userId,
                });
                expect(await grantedProductIds(userId)).toEqual([PAID_PRODUCT_ID]);
            },
        );
    });

    describe('redelivery of an event id', () => {
        it('answers 200 duplicate, keeps one row, and leaves the entitlement unchanged', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userId = await insertUser();
            const event = buildEvent({ app_user_id: userId });

            const first = await deliver(app, revenueCatAuth, event);
            const rowsBefore = await readPurchaseEvents();
            const entitlementsBefore = await readEntitlements();
            const second = await deliver(app, revenueCatAuth, event);

            expect(first.body).toEqual({ data: { status: 'recorded' } });
            expect(second.status).toBe(HTTP_OK);
            expect(second.body).toEqual({ data: { status: 'duplicate' } });
            expect(await readPurchaseEvents()).toEqual(rowsBefore);
            expect(rowsBefore).toHaveLength(1);
            expect(await readEntitlements()).toEqual(entitlementsBefore);
            expect(entitlementsBefore[0]?.status).toBe('granted');
        });

        it('never updates the stored row when the redelivered body changes its type, user, or time', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userA = await insertUser();
            const userB = await insertUser();
            const event = buildEvent({ app_user_id: userA });

            const first = await deliver(app, revenueCatAuth, event);
            const rowsBefore = await readPurchaseEvents();
            const entitlementsBefore = await readEntitlements();
            const asRefund = await deliver(app, revenueCatAuth, {
                ...event,
                event_timestamp_ms: BASE_TIMESTAMP_MS + 60_000,
                type: 'REFUND',
            });
            const asOtherUser = await deliver(app, revenueCatAuth, { ...event, app_user_id: userB });

            expect(first.body).toEqual({ data: { status: 'recorded' } });
            expect(asRefund.body).toEqual({ data: { status: 'duplicate' } });
            expect(asOtherUser.body).toEqual({ data: { status: 'duplicate' } });
            expect(await readPurchaseEvents()).toEqual(rowsBefore);
            expect(rowsBefore).toHaveLength(1);
            expect(rowsBefore[0]).toMatchObject({ kind: 'NON_RENEWING_PURCHASE', user_id: userA });
            expect(await readEntitlements()).toEqual(entitlementsBefore);
            expect(await grantedProductIds(userA)).toEqual([PAID_PRODUCT_ID]);
            expect(await grantedProductIds(userB)).toEqual([]);
        });
    });

    describe('an app user id that names no existing user', () => {
        const unresolvable: Array<[string, () => Promise<string>]> = [
            ['a random UUID with no user', async () => randomUUID()],
            ['a RevenueCat anonymous id', async () => `$RCAnonymousID:${distinctive()}`],
            [
                'the id of a deleted user',
                async () => {
                    const userId = await insertUser();
                    await database.pool.query('DELETE FROM users WHERE id = $1', [userId]);
                    return userId;
                },
            ],
        ];

        it.each(unresolvable)('records %s with user_id null and grants no one', async (_label, appUserId) => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const bystander = await insertUser();
            const event = buildEvent({ app_user_id: await appUserId() });

            const response = await deliver(app, revenueCatAuth, event);

            expect(response.status).toBe(HTTP_OK);
            expect(response.body).toEqual({ data: { status: 'recorded' } });
            const rows = await readPurchaseEvents();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ provider_event_id: event.id, user_id: null });
            expect(await readEntitlements()).toEqual([]);
            expect(await grantedProductIds(bystander)).toEqual([]);
        });
    });

    it('records an unmapped product, grants nothing, and warns without naming the user or payload', async () => {
        const { app, logLines, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const email = `Learner-${distinctive()}@Example.COM`;
        const userId = await insertUser(email);
        const event = buildEvent({
            app_user_id: userId,
            original_transaction_id: distinctive(),
            product_id: UNMAPPED_PRODUCT_ID,
            subscriber_attributes: { $email: { updated_at_ms: BASE_TIMESTAMP_MS, value: email } },
        });

        const response = await deliver(app, revenueCatAuth, event);
        await flushLogs();

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { status: 'recorded' } });
        const rows = await readPurchaseEvents();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ product_id: UNMAPPED_PRODUCT_ID, user_id: userId });
        expect(await readEntitlements()).toEqual([]);
        const warnings = logLines.filter((line) => JSON.parse(line).level === PINO_WARN_LEVEL);
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        const forbidden = [userId, String(event.id), email, String(event.transaction_id), String(event.original_transaction_id)];
        for (const line of warnings) {
            for (const value of forbidden) {
                expect(line.toLowerCase()).not.toContain(value.toLowerCase());
            }
        }
    });

    describe('a store that cannot grant or revoke', () => {
        it.each(['PROMOTIONAL', 'STRIPE'])('records a %s purchase with no entitlement', async (store) => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userId = await insertUser();
            const event = buildEvent({ app_user_id: userId, store });

            const response = await deliver(app, revenueCatAuth, event);

            expect(response.status).toBe(HTTP_OK);
            expect(response.body).toEqual({ data: { status: 'recorded' } });
            const rows = await readPurchaseEvents();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ provider_event_id: event.id, user_id: userId });
            expect(await readEntitlements()).toEqual([]);
        });

        it.each(['PROMOTIONAL', 'STRIPE'])('records a later %s refund without revoking an App Store grant', async (store) => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const userId = await insertUser();

            const purchase = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId }));
            const refund = await deliver(
                app,
                revenueCatAuth,
                buildEvent({ app_user_id: userId, event_timestamp_ms: BASE_TIMESTAMP_MS + 60_000, store, type: 'REFUND' }),
            );

            expect(purchase.body).toEqual({ data: { status: 'recorded' } });
            expect(refund.body).toEqual({ data: { status: 'recorded' } });
            expect(await readPurchaseEvents()).toHaveLength(2);
            expect(await grantedProductIds(userId)).toEqual([PAID_PRODUCT_ID]);
        });
    });

    it('stores an allowlisted payload with no email, display name, app user id, alias, or extra value', async () => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const email = `Learner-${distinctive()}@Example.COM`;
        const displayName = `Ada Lovelace-${distinctive()}`;
        const alias = `$RCAnonymousID:${distinctive()}`;
        const originalAppUserId = `$RCAnonymousID:${distinctive()}`;
        const extraValue = `extra-${distinctive()}`;
        const userId = await insertUser(email);
        const event = buildEvent({
            aliases: [alias, userId],
            app_user_id: userId,
            original_app_user_id: originalAppUserId,
            subscriber_attributes: {
                $displayName: { updated_at_ms: BASE_TIMESTAMP_MS, value: displayName },
                $email: { updated_at_ms: BASE_TIMESTAMP_MS, value: email },
            },
            unexpected_field: extraValue,
        });

        const response = await deliver(app, revenueCatAuth, event);

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { status: 'recorded' } });
        const rows = await readPurchaseEvents();
        expect(rows).toHaveLength(1);
        const [{ payload, payload_text: payloadText }] = rows;
        const storedText = payloadText.toLowerCase();
        for (const value of [email, displayName, userId, alias, originalAppUserId, extraValue]) {
            expect(storedText).not.toContain(value.toLowerCase());
        }
        expect(storedText).not.toContain('subscriber_attributes');
        for (const key of Object.keys(payload)) {
            expect(PAYLOAD_ALLOWLIST.has(key)).toBe(true);
        }
        expect(payload).toMatchObject({ store: 'APP_STORE', type: 'NON_RENEWING_PURCHASE' });
    });

    it('logs no email, display name, app user id, or event id for any recorded outcome', async () => {
        const { app, logLines, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const secrets: string[] = [];
        const email = `Learner-${distinctive()}@Example.COM`;
        const displayName = `Ada Lovelace-${distinctive()}`;
        const userId = await insertUser(email);
        secrets.push(email, displayName, userId);
        function tracked(overrides: Record<string, unknown>): Record<string, unknown> {
            const event = buildEvent({
                subscriber_attributes: {
                    $displayName: { updated_at_ms: BASE_TIMESTAMP_MS, value: displayName },
                    $email: { updated_at_ms: BASE_TIMESTAMP_MS, value: email },
                },
                ...overrides,
            });
            secrets.push(String(event.app_user_id), String(event.id));
            return event;
        }
        const purchase = tracked({ app_user_id: userId });

        const statuses = [
            (await deliver(app, revenueCatAuth, purchase)).body,
            (await deliver(app, revenueCatAuth, purchase)).body,
            (await deliver(app, revenueCatAuth, tracked({ app_user_id: userId, product_id: UNMAPPED_PRODUCT_ID }))).body,
            (await deliver(app, revenueCatAuth, tracked({}))).body,
            (await deliver(app, revenueCatAuth, tracked({ app_user_id: `$RCAnonymousID:${distinctive()}` }))).body,
            (await deliver(app, revenueCatAuth, tracked({ app_user_id: userId, store: 'PROMOTIONAL' }))).body,
            (
                await deliver(
                    app,
                    revenueCatAuth,
                    tracked({ app_user_id: userId, event_timestamp_ms: BASE_TIMESTAMP_MS + 60_000, type: 'REFUND' }),
                )
            ).body,
        ];
        await flushLogs();

        expect(statuses.map((body) => body.data?.status)).toEqual([
            'recorded',
            'duplicate',
            'recorded',
            'recorded',
            'recorded',
            'recorded',
            'recorded',
        ]);
        expect(logLines.length).toBeGreaterThanOrEqual(statuses.length);
        for (const line of logLines) {
            const lowered = line.toLowerCase();
            for (const value of secrets) {
                expect(lowered).not.toContain(value.toLowerCase());
            }
        }
    });
});
