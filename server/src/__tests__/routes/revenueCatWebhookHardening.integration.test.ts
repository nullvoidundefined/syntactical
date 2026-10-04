// B-39a2 (B-39, security section): hardening of POST /v1/webhooks/revenuecat. Every spelling
// Express routes to the webhook (a trailing slash, another letter case) authenticates before any
// body is read and reads its body under the route's own 64 KB limit, never the global 10 KB
// parser; the event must carry app_user_id, product_id, and store as strings; an authenticated
// empty application/json body is 400 INPUT_INVALID_BODY, not 415; and no outcome logs the event's
// app user id, its id, or any other payload value.
import { randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const TRAILING_SLASH_ROUTE = '/v1/webhooks/revenuecat/';
const MIXED_CASE_ROUTE = '/v1/webhooks/RevenueCat';
const ROUTE_VARIANTS = [TRAILING_SLASH_ROUTE, MIXED_CASE_ROUTE];
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const SETUP_TIMEOUT_MS = 120_000;
const KB = 1024;
const GLOBAL_LIMIT_BYTES = 10 * KB;
const ROUTE_LIMIT_BYTES = 64 * KB;
const OVER_GLOBAL_LIMIT_PADDING = 12 * KB;
const UNDER_ROUTE_LIMIT_PADDING = 30 * KB;
const OVER_ROUTE_LIMIT_PADDING = 70 * KB;
const DISTINCTIVE_BYTES = 12;
const PAID_PRODUCT_ID = 'syntactical.python.full';
const paidProductIds: ReadonlySet<string> = new Set([PAID_PRODUCT_ID]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>['app'];

function distinctive(): string {
    return randomBytes(DISTINCTIVE_BYTES).toString('hex');
}

// A RevenueCat-shaped event; the app user id names no user, so even a handled type grants nothing.
function buildEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        app_user_id: randomUUID(),
        environment: 'SANDBOX',
        event_timestamp_ms: Date.now(),
        id: randomUUID(),
        product_id: PAID_PRODUCT_ID,
        store: 'APP_STORE',
        type: 'NON_RENEWING_PURCHASE',
        ...overrides,
    };
}

function withoutKey(event: Record<string, unknown>, key: string): Record<string, unknown> {
    const copy = { ...event };
    delete copy[key];
    return copy;
}

// A body whose size comes from insignificant JSON whitespace before the closing brace, so the
// parsed value is the same small event whatever the padding.
function buildPaddedBody(event: Record<string, unknown>, padding: number): string {
    return `{"event": ${JSON.stringify(event)}${' '.repeat(padding)}}`;
}

async function countPurchaseEvents(): Promise<number> {
    const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM purchase_events');
    return Number(rows[0].count);
}

function postTo(app: TestApp, path: string, authorization: string | undefined) {
    const pending = request(app).post(path);
    return authorization === undefined ? pending : pending.set('Authorization', authorization);
}

// An authenticated application/json POST with no body and neither Content-Length nor
// Transfer-Encoding, which supertest cannot send.
async function postWithoutLengthHeader(app: TestApp, authorization: string): Promise<{ body: string; status: number }> {
    const server = app.listen(0);
    try {
        const { port } = server.address() as AddressInfo;
        return await new Promise((resolve, reject) => {
            const pending = http.request(
                {
                    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
                    host: '127.0.0.1',
                    method: 'POST',
                    path: '/v1/webhooks/revenuecat',
                    port,
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    response.on('data', (chunk: Buffer) => chunks.push(chunk));
                    response.on('end', () => {
                        resolve({ body: Buffer.concat(chunks).toString('utf8'), status: response.statusCode ?? 0 });
                    });
                },
            );
            pending.on('error', reject);
            pending.removeHeader('Content-Length');
            pending.removeHeader('Transfer-Encoding');
            pending.end();
        });
    } finally {
        await new Promise((resolve) => {
            server.close(resolve);
        });
    }
}

function flushLogs(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat hardening (B-39a2)', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    describe('path variants reach the same auth-first handling', () => {
        it('answers an unauthenticated malformed JSON body on the trailing-slash path with 401, not 400', async () => {
            const { app } = createWebhookTestApp({ paidProductIds, pool: database.pool });

            const response = await postTo(app, TRAILING_SLASH_ROUTE, undefined)
                .set('Content-Type', 'application/json')
                .send('{"event": ');

            expect(response.status).toBe(HTTP_UNAUTHORIZED);
            expect(response.body.error.code).toBe('WEBHOOK_UNAUTHORIZED');
        });

        it('answers an unauthenticated body over 10 KB on the mixed-case path with 401, not 413', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const body = buildPaddedBody(buildEvent(), OVER_GLOBAL_LIMIT_PADDING);
            expect(Buffer.byteLength(body)).toBeGreaterThan(GLOBAL_LIMIT_BYTES);

            const response = await postTo(app, MIXED_CASE_ROUTE, `${revenueCatAuth}x`)
                .set('Content-Type', 'application/json')
                .send(body);

            expect(response.status).toBe(HTTP_UNAUTHORIZED);
            expect(response.body.error.code).toBe('WEBHOOK_UNAUTHORIZED');
        });

        it.each(ROUTE_VARIANTS)(
            'answers an authenticated 30 KB TEST event on %s with 200 ignored, under the 64 KB route limit',
            async (path) => {
                const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
                const body = buildPaddedBody(buildEvent({ type: 'TEST' }), UNDER_ROUTE_LIMIT_PADDING);
                expect(Buffer.byteLength(body)).toBeGreaterThan(GLOBAL_LIMIT_BYTES);
                expect(Buffer.byteLength(body)).toBeLessThan(ROUTE_LIMIT_BYTES);

                const response = await postTo(app, path, revenueCatAuth).set('Content-Type', 'application/json').send(body);

                expect(response.status).toBe(HTTP_OK);
                expect(response.body).toEqual({ data: { status: 'ignored' } });
                expect(await countPurchaseEvents()).toBe(0);
            },
        );
    });

    describe('the full event shape is required', () => {
        const invalidEvents: Array<[string, () => Record<string, unknown>]> = [
            ['an event without app_user_id', () => withoutKey(buildEvent(), 'app_user_id')],
            ['an event with a numeric app_user_id', () => buildEvent({ app_user_id: 12345 })],
            ['an event with a numeric product_id', () => buildEvent({ product_id: 12345 })],
            ['an event with a null product_id', () => buildEvent({ product_id: null })],
            ['an event without product_id', () => withoutKey(buildEvent(), 'product_id')],
            ['an event without store', () => withoutKey(buildEvent(), 'store')],
            ['an event with a numeric store', () => buildEvent({ store: 1 })],
        ];

        it.each(invalidEvents)('answers %s with 400 INPUT_INVALID_BODY and stores nothing', async (_label, build) => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });

            const response = await postTo(app, '/v1/webhooks/revenuecat', revenueCatAuth)
                .set('Content-Type', 'application/json')
                .send(JSON.stringify({ event: build() }));

            expect(response.status).toBe(HTTP_BAD_REQUEST);
            expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
            expect(await countPurchaseEvents()).toBe(0);
        });
    });

    // An empty body may arrive with Content-Length: 0 or with no length or transfer encoding
    // header at all; both are an empty application/json body, not a missing media type.
    it('answers an authenticated empty application/json body with 400 INPUT_INVALID_BODY, not 415', async () => {
        const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });

        const zeroLength = await postTo(app, '/v1/webhooks/revenuecat', revenueCatAuth)
            .set('Content-Type', 'application/json')
            .set('Content-Length', '0')
            .send('');
        const noLengthHeader = await postWithoutLengthHeader(app, revenueCatAuth);

        expect(zeroLength.status).toBe(HTTP_BAD_REQUEST);
        expect(zeroLength.body.error.code).toBe('INPUT_INVALID_BODY');
        expect(noLengthHeader.status).toBe(HTTP_BAD_REQUEST);
        expect(JSON.parse(noLengthHeader.body).error.code).toBe('INPUT_INVALID_BODY');
        expect(await countPurchaseEvents()).toBe(0);
    });

    it('logs no app_user_id, event id, or payload value across 401, 400, 413, and 200 outcomes', async () => {
        const { app, logLines, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const secrets: string[] = [];
        // Each event carries run-time values in its app user id, id, and a payload field.
        function trackedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
            const event = buildEvent({ transaction_id: distinctive(), ...overrides });
            secrets.push(String(event.app_user_id), String(event.id), String(event.transaction_id));
            return event;
        }
        function json(path: string, authorization: string | undefined) {
            return postTo(app, path, authorization).set('Content-Type', 'application/json');
        }
        const route = '/v1/webhooks/revenuecat';

        const statuses = [
            (await json(route, undefined).send(JSON.stringify({ event: trackedEvent() }))).status,
            (await json(TRAILING_SLASH_ROUTE, `${revenueCatAuth}x`).send(JSON.stringify({ event: trackedEvent() }))).status,
            (await json(route, revenueCatAuth).send(JSON.stringify({ event: withoutKey(trackedEvent(), 'store') }))).status,
            (await json(route, revenueCatAuth).send(JSON.stringify({ event: trackedEvent() }).slice(0, -2))).status,
            (await json(MIXED_CASE_ROUTE, revenueCatAuth).send(buildPaddedBody(trackedEvent(), OVER_ROUTE_LIMIT_PADDING)))
                .status,
            (await json(route, revenueCatAuth).send(JSON.stringify({ event: trackedEvent({ type: 'TEST' }) }))).status,
            (await json(TRAILING_SLASH_ROUTE, revenueCatAuth).send(JSON.stringify({ event: trackedEvent({ type: 'TEST' }) })))
                .status,
        ];
        await flushLogs();

        expect(statuses).toEqual([
            HTTP_UNAUTHORIZED,
            HTTP_UNAUTHORIZED,
            HTTP_BAD_REQUEST,
            HTTP_BAD_REQUEST,
            HTTP_PAYLOAD_TOO_LARGE,
            HTTP_OK,
            HTTP_OK,
        ]);
        expect(logLines.length).toBeGreaterThanOrEqual(statuses.length);
        for (const line of logLines) {
            for (const value of secrets) {
                expect(line).not.toContain(value);
            }
        }
    });
});
