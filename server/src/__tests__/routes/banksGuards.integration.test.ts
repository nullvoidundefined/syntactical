// B-37b guards: every 401 from GET /v1/banks/:language/:difficulty is uncached, 403 and 404 carry
// their error codes, a re-granted entitlement serves the bank on the next request, a failing
// entitlement query answers 500 with no bank bytes, and HEAD answers 401 or 403 with no body.
import { once } from 'node:events';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';

import request from 'supertest';
import type { Response } from 'supertest';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { PaidBank } from '../../types/PaidBank.js';
import { createBanksTestApp } from '../integration/createBanksTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;
const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const MEDIUM_ROUTE = '/v1/banks/python/medium';
const HARD_ROUTE = '/v1/banks/python/hard';
const MEDIUM_PRODUCT = 'syntactical.python.medium';
const HARD_PRODUCT = 'syntactical.python.hard';
const MEDIUM_MARKER = 'paid-bank-marker-python-medium';
const HARD_MARKER = 'paid-bank-marker-python-hard';

function bankFixture(difficulty: string, marker: string): Buffer {
    const document = { difficulty, language: 'python', questions: [{ id: `py-${difficulty}-0`, marker }] };
    return Buffer.from(`${JSON.stringify(document, null, 4)}\n`, 'utf8');
}

const mediumBank: PaidBank = { body: bankFixture('medium', MEDIUM_MARKER), productId: MEDIUM_PRODUCT };
const hardBank: PaidBank = { body: bankFixture('hard', HARD_MARKER), productId: HARD_PRODUCT };
const paidBanks = new Map<string, PaidBank>([
    ['python/medium', mediumBank],
    ['python/hard', hardBank],
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function rawBody(res: Response, callback: (error: Error | null, body: Buffer) => void): void {
    const stream = res as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => callback(null, Buffer.concat(chunks)));
}

function bodyBytes(response: Response): Buffer {
    return (response.body as Buffer | undefined) ?? Buffer.alloc(0);
}

function expectNoBankBytes(response: Response): void {
    const text = bodyBytes(response).toString('utf8');
    expect(text).not.toContain(MEDIUM_MARKER);
    expect(text).not.toContain(HARD_MARKER);
}

function errorCode(response: Response): unknown {
    const parsed = JSON.parse(bodyBytes(response).toString('utf8')) as { error?: { code?: unknown } };
    return parsed.error?.code;
}

function expectNoStore(response: Response): void {
    const cacheControl = String(response.headers['cache-control'] ?? '');
    expect(cacheControl).toContain('private');
    expect(cacheControl).toContain('no-store');
}

function getAnonymous(app: ReturnType<typeof createBanksTestApp>['app'], path: string) {
    return request(app).get(path).set('Origin', ALLOWED_ORIGIN).buffer(true).parse(rawBody);
}

function getWithBearer(app: ReturnType<typeof createBanksTestApp>['app'], sessionToken: string, path: string) {
    return request(app)
        .get(path)
        .set('Authorization', `Bearer ${sessionToken}`)
        .set('Origin', ALLOWED_ORIGIN)
        .buffer(true)
        .parse(rawBody);
}

async function grant(userId: string, productId: string, status: 'granted' | 'revoked' = 'granted'): Promise<void> {
    await database.pool.query(
        'INSERT INTO entitlements (user_id, product_id, status, source) VALUES ($1, $2, $3, $4)',
        [userId, productId, status, 'test'],
    );
}

// Sends a HEAD over a raw socket and returns the status and every byte after the header block,
// so a body written on the wire is seen even though HTTP clients discard it for HEAD.
async function rawHead(
    port: number,
    path: string,
    headers: Record<string, string>,
): Promise<{ body: Buffer; status: number }> {
    const socket = connect(port, '127.0.0.1');
    await once(socket, 'connect');
    const lines = [`HEAD ${path} HTTP/1.1`, 'Host: localhost', `Origin: ${ALLOWED_ORIGIN}`, 'Connection: close'];
    for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    const chunks: Buffer[] = [];
    for await (const chunk of socket) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const headerEnd = raw.indexOf('\r\n\r\n');
    const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(raw.toString('latin1'))?.[1]);
    return { body: raw.subarray(headerEnd + 4), status };
}

// The real pool, except that any query whose SQL mentions entitlements rejects, so the session
// lookup still works and only the entitlement check fails.
function poolFailingEntitlements(pool: pg.Pool): pg.Pool {
    return new Proxy(pool, {
        get(target, property, receiver) {
            if (property === 'query') {
                return function query(text: unknown, ...rest: unknown[]) {
                    const sql = typeof text === 'string' ? text : String((text as { text?: unknown })?.text ?? '');
                    if (sql.includes('entitlements')) {
                        return Promise.reject(new Error('simulated entitlement query failure'));
                    }
                    return (target.query as (...args: unknown[]) => unknown).call(target, text, ...rest);
                };
            }
            const value: unknown = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
    });
}

describe.skipIf(SKIP_DATABASE_TESTS)('GET /v1/banks/:language/:difficulty guards', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('marks every 401 private, no-store: no session on paid, free, and unknown paths', async () => {
        const { app } = createBanksTestApp({ paidBanks, pool: database.pool });

        for (const path of [MEDIUM_ROUTE, '/v1/banks/python/easy', '/v1/banks/cobol/medium']) {
            const response = await getAnonymous(app, path);
            expect({ path, status: response.status }).toEqual({ path, status: HTTP_UNAUTHORIZED });
            expectNoStore(response);
            expectNoBankBytes(response);
        }
    });

    it('marks the 401 for an expired session and a revoked session private, no-store', async () => {
        const { app, now } = createBanksTestApp({ paidBanks, pool: database.pool });
        const expired = await insertSession(database.pool, {
            createdAt: new Date(now().getTime() - 31 * DAY_MS),
            expiresAt: new Date(now().getTime() - DAY_MS),
            lastUsedAt: new Date(now().getTime() - DAY_MS),
        });
        const revoked = await insertSession(database.pool, { createdAt: now(), revokedAt: now() });
        await grant(expired.userId, MEDIUM_PRODUCT);
        await grant(revoked.userId, MEDIUM_PRODUCT);

        for (const { sessionToken } of [expired, revoked]) {
            const response = await getWithBearer(app, sessionToken, MEDIUM_ROUTE);
            expect(response.status).toBe(HTTP_UNAUTHORIZED);
            expectNoStore(response);
            expectNoBankBytes(response);
        }
    });

    it('answers 403 with ENTITLEMENT_REQUIRED for no row, a revoked row, another user, and the wrong product', async () => {
        const { app, now } = createBanksTestApp({ paidBanks, pool: database.pool });
        const noRow = await insertSession(database.pool, { createdAt: now() });
        const revokedRow = await insertSession(database.pool, { createdAt: now() });
        await grant(revokedRow.userId, MEDIUM_PRODUCT, 'revoked');
        const otherUser = await insertSession(database.pool, { createdAt: now() });
        const holder = await insertSession(database.pool, { createdAt: now() });
        await grant(holder.userId, MEDIUM_PRODUCT);
        const wrongProduct = await insertSession(database.pool, { createdAt: now() });
        await grant(wrongProduct.userId, MEDIUM_PRODUCT);

        const cases = [
            { name: 'no row', path: MEDIUM_ROUTE, token: noRow.sessionToken },
            { name: 'revoked', path: MEDIUM_ROUTE, token: revokedRow.sessionToken },
            { name: 'other user', path: MEDIUM_ROUTE, token: otherUser.sessionToken },
            { name: 'wrong product', path: HARD_ROUTE, token: wrongProduct.sessionToken },
        ];
        for (const { name, path, token } of cases) {
            const response = await getWithBearer(app, token, path);
            expect({ name, status: response.status }).toEqual({ name, status: HTTP_FORBIDDEN });
            expect({ code: errorCode(response), name }).toEqual({ code: 'ENTITLEMENT_REQUIRED', name });
            expectNoBankBytes(response);
        }
    });

    it('answers 404 with ROUTING_NOT_FOUND for a free bank path', async () => {
        const { app, now } = createBanksTestApp({ paidBanks, pool: database.pool });
        const signed = await insertSession(database.pool, { createdAt: now() });

        const response = await getWithBearer(app, signed.sessionToken, '/v1/banks/python/easy');

        expect(response.status).toBe(HTTP_NOT_FOUND);
        expect(errorCode(response)).toBe('ROUTING_NOT_FOUND');
        expectNoBankBytes(response);
    });

    it('serves the bank on the next request after a revoked entitlement is granted again', async () => {
        const { app, now } = createBanksTestApp({ paidBanks, pool: database.pool });
        const signed = await insertSession(database.pool, { createdAt: now() });
        await grant(signed.userId, MEDIUM_PRODUCT, 'revoked');
        expect((await getWithBearer(app, signed.sessionToken, MEDIUM_ROUTE)).status).toBe(HTTP_FORBIDDEN);

        await database.pool.query(
            "UPDATE entitlements SET status = 'granted' WHERE user_id = $1 AND product_id = $2",
            [signed.userId, MEDIUM_PRODUCT],
        );
        const response = await getWithBearer(app, signed.sessionToken, MEDIUM_ROUTE);

        expect(response.status).toBe(HTTP_OK);
        expect(Buffer.compare(bodyBytes(response), mediumBank.body)).toBe(0);
    });

    it('answers 500 with no bank bytes, private and no-store, when the entitlement query fails', async () => {
        const failing = poolFailingEntitlements(database.pool);
        const { app, now } = createBanksTestApp({ paidBanks, pool: failing });
        const signed = await insertSession(database.pool, { createdAt: now() });
        await grant(signed.userId, MEDIUM_PRODUCT);

        const response = await getWithBearer(app, signed.sessionToken, MEDIUM_ROUTE);

        expect(response.status).toBe(HTTP_INTERNAL);
        expectNoBankBytes(response);
        expectNoStore(response);
    });

    it('answers HEAD with 401 without a session and 403 without the entitlement, with no body', async () => {
        const { app, now } = createBanksTestApp({ paidBanks, pool: database.pool });
        const signed = await insertSession(database.pool, { createdAt: now() });

        const server = createServer(app).listen(0);
        try {
            await once(server, 'listening');
            const { port } = server.address() as AddressInfo;

            const anonymous = await rawHead(port, MEDIUM_ROUTE, {});
            const unentitled = await rawHead(port, MEDIUM_ROUTE, { Authorization: `Bearer ${signed.sessionToken}` });

            expect(anonymous.status).toBe(HTTP_UNAUTHORIZED);
            expect(anonymous.body.length).toBe(0);
            expect(unentitled.status).toBe(HTTP_FORBIDDEN);
            expect(unentitled.body.length).toBe(0);
        } finally {
            server.close();
        }
    });
});
