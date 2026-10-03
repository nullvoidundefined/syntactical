// A2: a backend that dies while its client is checked out inside withTransaction (here ended by
// pg_terminate_backend from another connection while no query is pending) never crashes the
// process: the client's error event has a listener for the life of the checkout, so nothing
// reaches uncaughtException. The next query in the work rejects, withTransaction rejects, the
// dead client is destroyed rather than returned to the pool, and the pool serves a new query.
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { withTransaction } from '../../clients/withTransaction.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
// Long enough for the terminated backend's FATAL message and socket close to reach the client
// while no query is pending.
const AFTER_TERMINATE_WAIT_MS = 500;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
let uncaught: unknown[] = [];

function recordUncaught(error: unknown): void {
    uncaught.push(error);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ends the backend with the given pid from a connection outside the pool under test, so the
// pool's counts reflect only the client the transaction holds.
async function terminateBackend(pid: number): Promise<void> {
    const outsider = new pg.Client({ connectionString: database.databaseUrl });
    await outsider.connect();
    try {
        await outsider.query('SELECT pg_terminate_backend($1)', [pid]);
    } finally {
        await outsider.end();
    }
}

describe.skipIf(SKIP_DATABASE_TESTS)('withTransaction when the backend dies mid-transaction', () => {
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
        'rejects without an uncaught exception when the backend is terminated while the work holds the client, destroys that client, and the pool still serves a query',
        async () => {
            let totalWhileHeld = 0;
            const outcome = withTransaction(database.pool, async (client) => {
                const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
                totalWhileHeld = database.pool.totalCount;
                await terminateBackend(rows[0].pid);
                await wait(AFTER_TERMINATE_WAIT_MS);
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
