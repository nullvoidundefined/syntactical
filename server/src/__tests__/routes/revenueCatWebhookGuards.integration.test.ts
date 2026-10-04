// B-39c regression guards (B-38, B-39, security section) for POST /v1/webhooks/revenuecat, kept for
// the R-109 security review. A failing entitlement recompute rolls the insert back and answers 500,
// so a redelivery records and grants. An allowlisted key carrying an object, an array, or null is
// not stored, nor any nested value. A user deleted concurrently with a delivery leaves no row
// referencing the user and no stored email. An uppercase-hex UUID app_user_id resolves to the
// user. A second, distinct grant leaves entitlements.updated_at unchanged. A product_id and an
// app_user_id of exactly 200 characters are accepted.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const SETUP_TIMEOUT_MS = 120_000;
const DISTINCTIVE_BYTES = 12;
const FIELD_LIMIT = 200;
const RACE_ROUNDS = 8;
const UPDATED_AT_GAP_MS = 50;
const PURCHASE_TIMESTAMP_MS = 1_790_000_000_000;
const LATER_TIMESTAMP_MS = PURCHASE_TIMESTAMP_MS + 3_600_000;
const PAID_PRODUCT_ID = 'syntactical.python.full';
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

async function readPayloads(): Promise<Array<{ payload: Record<string, unknown>; text: string }>> {
    const { rows } = await database.pool.query<{ payload: Record<string, unknown>; text: string }>(
        'SELECT payload, payload::text AS text FROM purchase_events',
    );
    return rows;
}

async function entitlementStatus(userId: string): Promise<string | undefined> {
    const { rows } = await database.pool.query<{ status: string }>(
        'SELECT status FROM entitlements WHERE user_id = $1 AND product_id = $2',
        [userId, PAID_PRODUCT_ID],
    );
    return rows[0]?.status;
}

async function entitlementUpdatedAt(userId: string): Promise<string | undefined> {
    const { rows } = await database.pool.query<{ updated_at: string }>(
        'SELECT updated_at::text AS updated_at FROM entitlements WHERE user_id = $1 AND product_id = $2',
        [userId, PAID_PRODUCT_ID],
    );
    return rows[0]?.updated_at;
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat regression guards (B-39c)', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('rolls back the insert when the entitlement recompute fails, then records and grants on redelivery', async () => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const userId = await insertUser();
        const event = buildEvent({ app_user_id: userId });
        await database.pool.query(`
            CREATE FUNCTION b39c_refuse_entitlement() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'entitlement write refused by test'; END $$;
            CREATE TRIGGER b39c_refuse_entitlement BEFORE INSERT OR UPDATE ON entitlements
            FOR EACH ROW EXECUTE FUNCTION b39c_refuse_entitlement();
        `);
        let failed: request.Response;
        try {
            failed = await deliver(app, revenueCatAuth, event);
        } finally {
            await database.pool.query(`
                DROP TRIGGER b39c_refuse_entitlement ON entitlements;
                DROP FUNCTION b39c_refuse_entitlement();
            `);
        }
        const eventsAfterFailure = await countPurchaseEvents();
        const entitlementAfterFailure = await entitlementStatus(userId);

        const redelivered = await deliver(app, revenueCatAuth, event);

        expect(failed.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
        expect(eventsAfterFailure).toBe(0);
        expect(entitlementAfterFailure).toBeUndefined();
        expect(redelivered.status).toBe(HTTP_OK);
        expect(redelivered.body).toEqual({ data: { status: 'recorded' } });
        expect(await countPurchaseEvents()).toBe(1);
        expect(await entitlementStatus(userId)).toBe('granted');
    });

    it('stores no allowlisted key whose value is an object, an array, or null, nor any nested value', async () => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const nestedEmail = runTimeEmail();
        const nestedPrice = distinctive();
        const event = buildEvent({
            currency: null,
            price: [nestedPrice, nestedEmail],
            transaction_id: { email: nestedEmail },
        });

        const response = await deliver(app, revenueCatAuth, event);

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { status: 'recorded' } });
        const payloads = await readPayloads();
        expect(payloads).toHaveLength(1);
        expect(payloads[0].payload).not.toHaveProperty('transaction_id');
        expect(payloads[0].payload).not.toHaveProperty('price');
        expect(payloads[0].payload).not.toHaveProperty('currency');
        expect(payloads[0].payload).toMatchObject({ product_id: PAID_PRODUCT_ID, store: 'APP_STORE' });
        expect(payloads[0].text.toLowerCase()).not.toContain(nestedEmail.toLowerCase());
        expect(payloads[0].text).not.toContain(nestedPrice);
    });

    it('leaves no purchase_events or entitlements row, nor the email, for a user deleted concurrently with a delivery', async () => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        for (let round = 0; round < RACE_ROUNDS; round += 1) {
            const email = runTimeEmail();
            const userId = await insertUser(email);
            const event = buildEvent({
                app_user_id: userId,
                subscriber_attributes: { $email: { updated_at_ms: PURCHASE_TIMESTAMP_MS, value: email } },
            });
            async function deleteUser(): Promise<void> {
                const client = await database.pool.connect();
                try {
                    await client.query('BEGIN');
                    await client.query('DELETE FROM users WHERE id = $1', [userId]);
                    await client.query('COMMIT');
                } finally {
                    client.release();
                }
            }

            const [response] = await Promise.all([deliver(app, revenueCatAuth, event), deleteUser()]);

            expect(response.status).toBe(HTTP_OK);
            const { rows: userRows } = await database.pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
            const { rows: eventRows } = await database.pool.query('SELECT 1 FROM purchase_events WHERE user_id = $1', [
                userId,
            ]);
            const { rows: entitlementRows } = await database.pool.query(
                'SELECT 1 FROM entitlements WHERE user_id = $1',
                [userId],
            );
            expect(userRows).toEqual([]);
            expect(eventRows).toEqual([]);
            expect(entitlementRows).toEqual([]);
            for (const { text } of await readPayloads()) {
                expect(text.toLowerCase()).not.toContain(email.toLowerCase());
            }
        }
    });

    it('resolves an uppercase-hex UUID app_user_id to the existing user and grants that user', async () => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const userId = await insertUser();

        const response = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId.toUpperCase() }));

        expect(response.body).toEqual({ data: { status: 'recorded' } });
        const { rows } = await database.pool.query<{ user_id: string | null }>('SELECT user_id FROM purchase_events');
        expect(rows).toEqual([{ user_id: userId }]);
        expect(await entitlementStatus(userId)).toBe('granted');
    });

    it('leaves entitlements.updated_at unchanged on a second, distinct grant for an already granted product', async () => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const userId = await insertUser();

        const first = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: userId }));
        const updatedAtAfterFirst = await entitlementUpdatedAt(userId);
        await pause(UPDATED_AT_GAP_MS);
        const second = await deliver(
            app,
            revenueCatAuth,
            buildEvent({ app_user_id: userId, event_timestamp_ms: LATER_TIMESTAMP_MS }),
        );

        expect(first.body).toEqual({ data: { status: 'recorded' } });
        expect(second.body).toEqual({ data: { status: 'recorded' } });
        expect(await countPurchaseEvents()).toBe(2);
        expect(await entitlementStatus(userId)).toBe('granted');
        expect(updatedAtAfterFirst).toEqual(expect.any(String));
        expect(await entitlementUpdatedAt(userId)).toBe(updatedAtAfterFirst);
    });

    it(`accepts a product_id and an app_user_id of exactly ${FIELD_LIMIT} characters`, async () => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const atLimit = 'y'.repeat(FIELD_LIMIT);

        const response = await deliver(app, revenueCatAuth, buildEvent({ app_user_id: atLimit, product_id: atLimit }));

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { status: 'recorded' } });
        const { rows } = await database.pool.query<{ product_id: string; user_id: string | null }>(
            'SELECT product_id, user_id FROM purchase_events',
        );
        expect(rows).toEqual([{ product_id: atLimit, user_id: null }]);
    });
});
