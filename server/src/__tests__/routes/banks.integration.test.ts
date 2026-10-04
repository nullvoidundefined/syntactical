// B-37b: GET /v1/banks/:language/:difficulty serves a paid bank's stored bytes, unchanged, only to
// a session whose user holds a granted entitlement for that bank's productId. The session is
// checked first (401 for any path), then the bank path (404 for anything that is not a paid bank),
// then the entitlement (403), on every request with no caching anywhere.
import { createHash } from 'node:crypto';

import request from 'supertest';
import type { Response } from 'supertest';
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
const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const MEDIUM_ROUTE = '/v1/banks/python/medium';
const HARD_ROUTE = '/v1/banks/python/hard';
const MEDIUM_PRODUCT = 'syntactical.python.medium';
const HARD_PRODUCT = 'syntactical.python.hard';
const MEDIUM_MARKER = 'paid-bank-marker-python-medium';
const HARD_MARKER = 'paid-bank-marker-python-hard';
const JSON_CONTENT_TYPE = /^application\/json(;\s*charset=utf-8)?$/i;

// A pretty-printed bank with a trailing newline and non-ASCII text: parsing and re-serializing it
// (res.json, JSON.stringify without indentation, an ASCII-escaping encoder) changes its bytes.
function bankFixture(difficulty: string, marker: string): Buffer {
    const document = {
        difficulty,
        language: 'python',
        questions: [
            {
                answerIndex: 0,
                choices: [{ text: 'café ✓' }, { text: '日本語 üñî' }],
                id: `py-${difficulty}-0`,
                marker,
                prompt: 'What does print("naïve – résumé") output?',
                type: 'mc',
            },
        ],
    };
    return Buffer.from(`${JSON.stringify(document, null, 4)}\n`, 'utf8');
}

const mediumBank: PaidBank = { body: bankFixture('medium', MEDIUM_MARKER), productId: MEDIUM_PRODUCT };
const hardBank: PaidBank = { body: bankFixture('hard', HARD_MARKER), productId: HARD_PRODUCT };
const paidBanks = new Map<string, PaidBank>([
    ['python/medium', mediumBank],
    ['python/hard', hardBank],
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

// Collects the response body as raw bytes, whatever its Content-Type, so a test compares bytes.
// supertest types the parser's first argument as its Response, but at run time it is the
// incoming message stream.
function rawBody(res: Response, callback: (error: Error | null, body: Buffer) => void): void {
    const stream = res as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => callback(null, Buffer.concat(chunks)));
}

function bodyBytes(response: Response): Buffer {
    return response.body as Buffer;
}

function expectNoBankBytes(response: Response): void {
    const text = bodyBytes(response).toString('utf8');
    expect(text).not.toContain(MEDIUM_MARKER);
    expect(text).not.toContain(HARD_MARKER);
}

function expectErrorBody(response: Response, code?: string): void {
    const parsed = JSON.parse(bodyBytes(response).toString('utf8')) as {
        error?: { code?: unknown; message?: unknown };
    };
    expect(typeof parsed.error?.code).toBe('string');
    expect(typeof parsed.error?.message).toBe('string');
    if (code !== undefined) {
        expect(parsed.error?.code).toBe(code);
    }
}

function expectNoStore(response: Response): void {
    const cacheControl = String(response.headers['cache-control'] ?? '');
    expect(cacheControl).toContain('private');
    expect(cacheControl).toContain('no-store');
}

function sha256Hex(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}

interface Signed {
    app: ReturnType<typeof createBanksTestApp>['app'];
    now: () => Date;
    sessionToken: string;
    userId: string;
}

async function signIn(): Promise<Signed> {
    const { app, now } = createBanksTestApp({ paidBanks, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
    return { app, now, sessionToken, userId };
}

async function grant(userId: string, productId: string, status: 'granted' | 'revoked' = 'granted'): Promise<void> {
    await database.pool.query(
        'INSERT INTO entitlements (user_id, product_id, status, source) VALUES ($1, $2, $3, $4)',
        [userId, productId, status, 'test'],
    );
}

function getWithBearer(app: Signed['app'], sessionToken: string, path: string) {
    return request(app)
        .get(path)
        .set('Authorization', `Bearer ${sessionToken}`)
        .set('Origin', ALLOWED_ORIGIN)
        .buffer(true)
        .parse(rawBody);
}

function getSigned(signed: Signed, path: string) {
    return getWithBearer(signed.app, signed.sessionToken, path);
}

describe.skipIf(SKIP_DATABASE_TESTS)('GET /v1/banks/:language/:difficulty', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('answers 401 without a session for any bank path, paid, free, or unknown, and never sends bank bytes', async () => {
        const { app } = createBanksTestApp({ paidBanks, pool: database.pool });

        for (const path of [MEDIUM_ROUTE, HARD_ROUTE, '/v1/banks/python/easy', '/v1/banks/cobol/medium']) {
            const response = await request(app).get(path).buffer(true).parse(rawBody);
            expect({ path, status: response.status }).toEqual({ path, status: HTTP_UNAUTHORIZED });
            expectErrorBody(response, 'AUTH_SESSION_REQUIRED');
            expectNoBankBytes(response);
        }
    });

    it('answers 401 to an expired session and to a revoked session even when the user is entitled', async () => {
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
            expectErrorBody(response, 'AUTH_SESSION_REQUIRED');
            expectNoBankBytes(response);
        }
    });

    it('answers 403 when the user has no entitlement row for the bank', async () => {
        const signed = await signIn();

        const response = await getSigned(signed, MEDIUM_ROUTE);

        expect(response.status).toBe(HTTP_FORBIDDEN);
        expectErrorBody(response);
        expectNoBankBytes(response);
        expectNoStore(response);
    });

    it('answers 403 when the entitlement for the bank is revoked', async () => {
        const signed = await signIn();
        await grant(signed.userId, MEDIUM_PRODUCT, 'revoked');

        const response = await getSigned(signed, MEDIUM_ROUTE);

        expect(response.status).toBe(HTTP_FORBIDDEN);
        expectErrorBody(response);
        expectNoBankBytes(response);
        expectNoStore(response);
    });

    it('answers 403 when only another user holds a granted entitlement for the bank', async () => {
        const signed = await signIn();
        const other = await insertSession(database.pool, { createdAt: signed.now() });
        await grant(other.userId, MEDIUM_PRODUCT);

        const response = await getSigned(signed, MEDIUM_ROUTE);

        expect(response.status).toBe(HTTP_FORBIDDEN);
        expectErrorBody(response);
        expectNoBankBytes(response);
    });

    it('answers 403 for python/hard when the user is entitled only to python/medium', async () => {
        const signed = await signIn();
        await grant(signed.userId, MEDIUM_PRODUCT);

        const response = await getSigned(signed, HARD_ROUTE);

        expect(response.status).toBe(HTTP_FORBIDDEN);
        expectErrorBody(response);
        expectNoBankBytes(response);
    });

    it('serves the exact stored bytes as JSON to an entitled bearer session, uncached and without a cookie', async () => {
        const signed = await signIn();
        await grant(signed.userId, MEDIUM_PRODUCT);

        const response = await getSigned(signed, MEDIUM_ROUTE);

        expect(response.status).toBe(HTTP_OK);
        expect(String(response.headers['content-type'])).toMatch(JSON_CONTENT_TYPE);
        expect(Buffer.compare(bodyBytes(response), mediumBank.body)).toBe(0);
        expect(sha256Hex(bodyBytes(response))).toBe(sha256Hex(mediumBank.body));
        expectNoStore(response);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('serves the exact stored bytes to an entitled session presented by the syntactical_session cookie', async () => {
        const signed = await signIn();
        await grant(signed.userId, HARD_PRODUCT);

        const response = await request(signed.app)
            .get(HARD_ROUTE)
            .set('Cookie', `syntactical_session=${signed.sessionToken}`)
            .set('Origin', ALLOWED_ORIGIN)
            .buffer(true)
            .parse(rawBody);

        expect(response.status).toBe(HTTP_OK);
        expect(String(response.headers['content-type'])).toMatch(JSON_CONTENT_TYPE);
        expect(Buffer.compare(bodyBytes(response), hardBank.body)).toBe(0);
        expect(sha256Hex(bodyBytes(response))).toBe(sha256Hex(hardBank.body));
        expectNoStore(response);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('applies a revocation on the next request, with no cached decision', async () => {
        const signed = await signIn();
        await grant(signed.userId, MEDIUM_PRODUCT);
        expect((await getSigned(signed, MEDIUM_ROUTE)).status).toBe(HTTP_OK);

        await database.pool.query(
            "UPDATE entitlements SET status = 'revoked' WHERE user_id = $1 AND product_id = $2",
            [signed.userId, MEDIUM_PRODUCT],
        );
        const response = await getSigned(signed, MEDIUM_ROUTE);

        expect(response.status).toBe(HTTP_FORBIDDEN);
        expectNoBankBytes(response);
    });

    it('checks each request against its own session user, not an earlier caller', async () => {
        const entitled = await signIn();
        await grant(entitled.userId, MEDIUM_PRODUCT);
        const unentitled = await insertSession(database.pool, { createdAt: entitled.now() });

        expect((await getSigned(entitled, MEDIUM_ROUTE)).status).toBe(HTTP_OK);
        const response = await getWithBearer(entitled.app, unentitled.sessionToken, MEDIUM_ROUTE);

        expect(response.status).toBe(HTTP_FORBIDDEN);
        expectNoBankBytes(response);
    });

    it('answers 404 without bank bytes for a free bank, any path that is not a paid bank, and encoded traversal', async () => {
        const signed = await signIn();
        await grant(signed.userId, MEDIUM_PRODUCT);
        await grant(signed.userId, HARD_PRODUCT);
        // Each path matches the route's two segments, so the route answers it and sets Cache-Control.
        const routedPaths = [
            '/v1/banks/python/easy',
            '/v1/banks/cobol/medium',
            '/v1/banks/python/expert',
            '/v1/banks/__proto__/medium',
            '/v1/banks/constructor/medium',
            '/v1/banks/python/__proto__',
            '/v1/banks/python/constructor',
            '/v1/banks/python/medium.json',
            '/v1/banks/Python/medium',
        ];

        for (const path of routedPaths) {
            const response = await getSigned(signed, path);
            expect({ path, status: response.status }).toEqual({ path, status: HTTP_NOT_FOUND });
            expectErrorBody(response);
            expectNoBankBytes(response);
            expectNoStore(response);
        }

        // Encoded traversal may be answered by the route or by the not-found handler; either way 404.
        for (const path of [
            '/v1/banks/..%2F..%2Fetc/passwd',
            '/v1/banks/python/..%2Fhard',
            '/v1/banks/python/..%2Fmedium',
            '/v1/banks/python%2Fmedium/x',
            '/v1/banks/python/medium%00',
        ]) {
            const response = await getSigned(signed, path);
            expect({ path, status: response.status }).toEqual({ path, status: HTTP_NOT_FOUND });
            expectNoBankBytes(response);
        }
    });
});
