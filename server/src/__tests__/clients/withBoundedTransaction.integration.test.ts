// A1: both per-transaction timeouts withBoundedTransaction sets are fed their insecure values.
// A statement longer than the 5 s statement_timeout rejects with query_canceled (57014) and the
// client goes back to the pool idle and usable. A transaction left idle longer than the 10 s
// idle_in_transaction_session_timeout is ended by the backend: the next statement rejects,
// withBoundedTransaction rejects, the dead client is destroyed rather than returned to the pool,
// the process sees no uncaught exception, and the pool still serves a new query.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { withBoundedTransaction } from '../../clients/withBoundedTransaction.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const STATEMENT_TIMEOUT_CODE = '57014';
// Past the 5 s statement timeout.
const OVERLONG_STATEMENT = 'SELECT pg_sleep(6)';
// Past the 10 s idle-in-transaction session timeout.
const OVERLONG_IDLE_MS = 11_000;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
let uncaught: unknown[] = [];

function recordUncaught(error: unknown): void {
    uncaught.push(error);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(SKIP_DATABASE_TESTS)('withBoundedTransaction timeouts', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(() => {
        uncaught = [];
        process.on('uncaughtException', recordUncaught);
    });

    afterEach(() => {
        process.off('uncaughtException', recordUncaught);
    });

    it(
        'rejects a statement past the statement timeout with 57014 and returns the client to the pool idle and usable',
        async () => {
            const outcome = withBoundedTransaction(database.pool, (client) => client.query(OVERLONG_STATEMENT));

            await expect(outcome).rejects.toMatchObject({ code: STATEMENT_TIMEOUT_CODE });
            expect(database.pool.totalCount).toBeGreaterThan(0);
            expect(database.pool.idleCount).toBe(database.pool.totalCount);

            const { rows } = await database.pool.query<{ alive: number }>('SELECT 1 AS alive');
            expect(rows).toEqual([{ alive: 1 }]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'rejects a transaction left idle past the idle-in-transaction timeout, destroys its client without an uncaught exception, and the pool still serves a query',
        async () => {
            let totalWhileHeld = 0;
            const outcome = withBoundedTransaction(database.pool, async (client) => {
                await client.query('SELECT 1');
                totalWhileHeld = database.pool.totalCount;
                await wait(OVERLONG_IDLE_MS);
                await client.query('SELECT 1');
                return 'committed';
            });

            await expect(outcome).rejects.toBeInstanceOf(Error);
            expect(uncaught).toEqual([]);
            expect(totalWhileHeld).toBeGreaterThan(0);
            expect(database.pool.totalCount).toBe(totalWhileHeld - 1);

            const { rows } = await database.pool.query<{ alive: number }>('SELECT 1 AS alive');
            expect(rows).toEqual([{ alive: 1 }]);
        },
        TEST_TIMEOUT_MS,
    );
});
