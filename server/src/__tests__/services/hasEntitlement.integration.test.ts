// B-37b: hasEntitlement(database, userId, productId) is true only for a granted entitlement row
// owned by that user for that product id.
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { hasEntitlement } from '../../services/hasEntitlement.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const MEDIUM_PRODUCT = 'syntactical.python.medium';
const HARD_PRODUCT = 'syntactical.python.hard';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function newUserId(): Promise<string> {
    const { userId } = await insertSession(database.pool, { createdAt: new Date() });
    return userId;
}

async function insertEntitlement(userId: string, productId: string, status: 'granted' | 'revoked'): Promise<void> {
    await database.pool.query(
        'INSERT INTO entitlements (user_id, product_id, status, source) VALUES ($1, $2, $3, $4)',
        [userId, productId, status, 'test'],
    );
}

describe.skipIf(SKIP_DATABASE_TESTS)('hasEntitlement', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('is true for the user own granted entitlement to the product', async () => {
        const userId = await newUserId();
        await insertEntitlement(userId, MEDIUM_PRODUCT, 'granted');

        expect(await hasEntitlement(database.pool, userId, MEDIUM_PRODUCT)).toBe(true);
    });

    it('is false with no entitlement row', async () => {
        const userId = await newUserId();

        expect(await hasEntitlement(database.pool, userId, MEDIUM_PRODUCT)).toBe(false);
    });

    it('is false for a revoked entitlement', async () => {
        const userId = await newUserId();
        await insertEntitlement(userId, MEDIUM_PRODUCT, 'revoked');

        expect(await hasEntitlement(database.pool, userId, MEDIUM_PRODUCT)).toBe(false);
    });

    it('is false when only another user holds the granted entitlement', async () => {
        const userId = await newUserId();
        const otherUserId = await newUserId();
        await insertEntitlement(otherUserId, MEDIUM_PRODUCT, 'granted');

        expect(await hasEntitlement(database.pool, userId, MEDIUM_PRODUCT)).toBe(false);
    });

    it('is false when the user is granted a different product', async () => {
        const userId = await newUserId();
        await insertEntitlement(userId, MEDIUM_PRODUCT, 'granted');

        expect(await hasEntitlement(database.pool, userId, HARD_PRODUCT)).toBe(false);
    });

    it('treats the product id as an exact value, not a pattern', async () => {
        const userId = await newUserId();
        await insertEntitlement(userId, MEDIUM_PRODUCT, 'granted');

        expect(await hasEntitlement(database.pool, userId, 'syntactical.python.%')).toBe(false);
        expect(await hasEntitlement(database.pool, userId, "' OR '1'='1")).toBe(false);
    });
});
