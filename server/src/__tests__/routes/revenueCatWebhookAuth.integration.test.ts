// B-39a (B-39, security section): POST /v1/webhooks/revenuecat authenticates by its
// Authorization header before reading the body, so any header other than the configured value
// is 401 WEBHOOK_UNAUTHORIZED whatever the body; an authenticated request must be
// application/json, at most 64 KB (the global 10 KB parser does not apply to this path), well
// formed, and shaped as a RevenueCat event, or it is 415, 413, 400 INPUT_MALFORMED_JSON, or 400
// INPUT_INVALID_BODY with nothing stored; an event type the server does not handle is 200
// ignored with nothing stored. Neither the configured value nor any sent Authorization value
// reaches a log line, and without the webhooks deps the route does not exist.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/webhooks/revenuecat';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const SETUP_TIMEOUT_MS = 120_000;
const KB = 1024;
const GLOBAL_LIMIT_BYTES = 10 * KB;
const ROUTE_LIMIT_BYTES = 64 * KB;
const UNDER_ROUTE_LIMIT_PADDING = 30 * KB;
const OVER_ROUTE_LIMIT_PADDING = 70 * KB;
// Leaves room under 64 KB for the event itself and the JSON around the padding.
const JUST_UNDER_ROUTE_LIMIT_PADDING = 63 * KB;
const MAX_EVENT_ID_LENGTH = 200;
const PAID_PRODUCT_ID = 'syntactical.python.full';
const paidProductIds: ReadonlySet<string> = new Set([PAID_PRODUCT_ID]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

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

// A body whose size comes from insignificant JSON whitespace before the closing brace, so the
// parsed value is the same small event whatever the padding.
function buildPaddedBody(event: Record<string, unknown>, padding: number): string {
    return `{"event": ${JSON.stringify(event)}${' '.repeat(padding)}}`;
}

async function countPurchaseEvents(): Promise<number> {
    const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM purchase_events');
    return Number(rows[0].count);
}

function post(app: ReturnType<typeof createWebhookTestApp>['app'], authorization: string | undefined) {
    const pending = request(app).post(ROUTE);
    return authorization === undefined ? pending : pending.set('Authorization', authorization);
}

function flushLogs(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat authorization and body handling (B-39a)', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    describe('authorization', () => {
        // Each builds the header sent from the configured value.
        const wrongHeaders: Array<[string, (configured: string) => string | undefined]> = [
            ['a missing header', () => undefined],
            ['an empty header', () => ''],
            ['a wrong value of the same length', (configured) => randomBytes(configured.length / 2).toString('hex')],
            ['a shorter value', (configured) => configured.slice(0, configured.length / 2)],
            ['a longer value', (configured) => `${configured}${configured}`],
            ['the configured value plus extra characters', (configured) => `${configured}x`],
            ['the configured value minus its last character', (configured) => configured.slice(0, -1)],
            ['the configured value behind a Bearer scheme', (configured) => ['Bearer', configured].join(' ')],
        ];

        it.each(wrongHeaders)('answers %s with 401 WEBHOOK_UNAUTHORIZED and stores nothing', async (_label, build) => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });

            const response = await post(app, build(revenueCatAuth)).send({ event: buildEvent() });

            expect(response.status).toBe(HTTP_UNAUTHORIZED);
            expect(response.body.error.code).toBe('WEBHOOK_UNAUTHORIZED');
            expect(await countPurchaseEvents()).toBe(0);
        });

        it('answers an unauthenticated body over 64 KB with 401, not 413, so the body is never read', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const body = buildPaddedBody(buildEvent(), OVER_ROUTE_LIMIT_PADDING);
            expect(Buffer.byteLength(body)).toBeGreaterThan(ROUTE_LIMIT_BYTES);

            const response = await post(app, `${revenueCatAuth}x`).set('Content-Type', 'application/json').send(body);

            expect(response.status).toBe(HTTP_UNAUTHORIZED);
            expect(response.body.error.code).toBe('WEBHOOK_UNAUTHORIZED');
        });

        it('answers an unauthenticated malformed JSON body with 401, not 400', async () => {
            const { app } = createWebhookTestApp({ paidProductIds, pool: database.pool });

            const response = await post(app, undefined).set('Content-Type', 'application/json').send('{"event": ');

            expect(response.status).toBe(HTTP_UNAUTHORIZED);
            expect(response.body.error.code).toBe('WEBHOOK_UNAUTHORIZED');
        });

        it('answers an unauthenticated text/plain body with 401, not 415', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });

            const response = await post(app, revenueCatAuth.slice(0, -1))
                .set('Content-Type', 'text/plain')
                .send(JSON.stringify({ event: buildEvent() }));

            expect(response.status).toBe(HTTP_UNAUTHORIZED);
            expect(response.body.error.code).toBe('WEBHOOK_UNAUTHORIZED');
        });
    });

    describe('body handling with the correct header', () => {
        it('answers a text/plain body with 415 INPUT_UNSUPPORTED_MEDIA_TYPE and stores nothing', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });

            const response = await post(app, revenueCatAuth)
                .set('Content-Type', 'text/plain')
                .send(JSON.stringify({ event: buildEvent() }));

            expect(response.status).toBe(HTTP_UNSUPPORTED_MEDIA_TYPE);
            expect(response.body.error.code).toBe('INPUT_UNSUPPORTED_MEDIA_TYPE');
            expect(await countPurchaseEvents()).toBe(0);
        });

        it('answers malformed JSON between 10 KB and 64 KB with 400 INPUT_MALFORMED_JSON, read by the route parser', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const body = `{"event": ${' '.repeat(UNDER_ROUTE_LIMIT_PADDING)}`;
            expect(Buffer.byteLength(body)).toBeGreaterThan(GLOBAL_LIMIT_BYTES);
            expect(Buffer.byteLength(body)).toBeLessThan(ROUTE_LIMIT_BYTES);

            const response = await post(app, revenueCatAuth).set('Content-Type', 'application/json').send(body);

            expect(response.status).toBe(HTTP_BAD_REQUEST);
            expect(response.body.error.code).toBe('INPUT_MALFORMED_JSON');
        });

        it('limits the body to 64 KB: just under is read, just over is 413 INPUT_PAYLOAD_TOO_LARGE and stores nothing', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const justUnder = buildPaddedBody(buildEvent({ type: 'TEST' }), JUST_UNDER_ROUTE_LIMIT_PADDING);
            const over = buildPaddedBody(buildEvent(), OVER_ROUTE_LIMIT_PADDING);
            expect(Buffer.byteLength(justUnder)).toBeLessThan(ROUTE_LIMIT_BYTES);
            expect(Buffer.byteLength(over)).toBeGreaterThan(ROUTE_LIMIT_BYTES);

            const underResponse = await post(app, revenueCatAuth).set('Content-Type', 'application/json').send(justUnder);
            const overResponse = await post(app, revenueCatAuth).set('Content-Type', 'application/json').send(over);

            expect(underResponse.status).toBe(HTTP_OK);
            expect(underResponse.body).toEqual({ data: { status: 'ignored' } });
            expect(overResponse.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
            expect(overResponse.body.error.code).toBe('INPUT_PAYLOAD_TOO_LARGE');
            expect(await countPurchaseEvents()).toBe(0);
        });

        it('accepts a TEST event between 10 KB and 64 KB as ignored, past the global 10 KB parser', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
            const body = buildPaddedBody(buildEvent({ type: 'TEST' }), UNDER_ROUTE_LIMIT_PADDING);
            expect(Buffer.byteLength(body)).toBeGreaterThan(GLOBAL_LIMIT_BYTES);
            expect(Buffer.byteLength(body)).toBeLessThan(ROUTE_LIMIT_BYTES);

            const response = await post(app, revenueCatAuth).set('Content-Type', 'application/json').send(body);

            expect(response.status).toBe(HTTP_OK);
            expect(response.body).toEqual({ data: { status: 'ignored' } });
            expect(await countPurchaseEvents()).toBe(0);
        });

        const invalidBodies: Array<[string, () => unknown]> = [
            ['an empty object', () => ({})],
            ['a top-level array', () => [buildEvent()]],
            ['a null event', () => ({ event: null })],
            ['an event that is a string', () => ({ event: 'NON_RENEWING_PURCHASE' })],
            ['an event without an id', () => ({ event: { ...buildEvent(), id: undefined } })],
            ['an empty event id', () => ({ event: buildEvent({ id: '' }) })],
            ['an event id over 200 characters', () => ({ event: buildEvent({ id: 'e'.repeat(MAX_EVENT_ID_LENGTH + 1) }) })],
            ['a numeric event id', () => ({ event: buildEvent({ id: 12345 }) })],
            ['a zero event_timestamp_ms', () => ({ event: buildEvent({ event_timestamp_ms: 0 }) })],
            ['a negative event_timestamp_ms', () => ({ event: buildEvent({ event_timestamp_ms: -1 }) })],
            ['a fractional event_timestamp_ms', () => ({ event: buildEvent({ event_timestamp_ms: 1.5 }) })],
            ['a string event_timestamp_ms', () => ({ event: buildEvent({ event_timestamp_ms: String(Date.now()) }) })],
            [
                'an event_timestamp_ms beyond the safe integers',
                () => ({ event: buildEvent({ event_timestamp_ms: Number.MAX_SAFE_INTEGER + 1 }) }),
            ],
            ['a missing event_timestamp_ms', () => ({ event: { ...buildEvent(), event_timestamp_ms: undefined } })],
        ];

        it.each(invalidBodies)('answers %s with 400 INPUT_INVALID_BODY and stores nothing', async (_label, build) => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });

            const response = await post(app, revenueCatAuth)
                .set('Content-Type', 'application/json')
                .send(JSON.stringify(build()));

            expect(response.status).toBe(HTTP_BAD_REQUEST);
            expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
            expect(await countPurchaseEvents()).toBe(0);
        });

        it('answers an event type it does not handle with 200 ignored and stores no purchase_events row', async () => {
            const { app, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });

            const response = await post(app, revenueCatAuth)
                .set('Content-Type', 'application/json')
                .send(JSON.stringify({ event: buildEvent({ type: 'SOME_FUTURE_EVENT_TYPE' }) }));

            expect(response.status).toBe(HTTP_OK);
            expect(response.body).toEqual({ data: { status: 'ignored' } });
            expect(await countPurchaseEvents()).toBe(0);
        });
    });

    it('logs neither the configured value nor any Authorization value it was sent', async () => {
        const { app, logLines, revenueCatAuth } = createWebhookTestApp({ paidProductIds, pool: database.pool });
        const wrongValue = randomBytes(revenueCatAuth.length / 2).toString('hex');

        const statuses = [
            (await post(app, wrongValue).send({ event: buildEvent() })).status,
            (await post(app, `${revenueCatAuth}x`).send({ event: buildEvent() })).status,
            (await post(app, revenueCatAuth).send({ event: buildEvent({ type: 'TEST' }) })).status,
            (await post(app, revenueCatAuth).send({ event: buildEvent({ id: '' }) })).status,
            (await post(app, revenueCatAuth).set('Content-Type', 'application/json').send('{"event": ')).status,
        ];
        await flushLogs();

        expect(statuses).toEqual([HTTP_UNAUTHORIZED, HTTP_UNAUTHORIZED, HTTP_OK, HTTP_BAD_REQUEST, HTTP_BAD_REQUEST]);
        expect(logLines.length).toBeGreaterThanOrEqual(statuses.length);
        for (const line of logLines) {
            expect(line).not.toContain(revenueCatAuth);
            expect(line).not.toContain(wrongValue);
        }
    });

    it('mounts the route only when the webhooks deps are given', async () => {
        const answerKey: AnswerKey = new Map();
        const { app: withoutWebhooks } = createSyncTestApp({ answerKey, pool: database.pool });
        const { app: withWebhooks } = createWebhookTestApp({ paidProductIds, pool: database.pool });

        const unmounted = await request(withoutWebhooks)
            .post(ROUTE)
            .set('Content-Type', 'application/json')
            .send({ event: buildEvent() });
        const mounted = await request(withWebhooks)
            .post(ROUTE)
            .set('Content-Type', 'application/json')
            .send({ event: buildEvent() });

        expect(unmounted.status).toBe(HTTP_NOT_FOUND);
        expect(mounted.status).toBe(HTTP_UNAUTHORIZED);
    });
});
