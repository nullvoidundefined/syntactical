// B-3.2: the schema migrations, run with the server's migrate scripts against
// a real Postgres. Each test gets an empty scratch database of its own.
import { randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';

import { createScratchDatabase } from '../integration/createScratchDatabase.js';
import { runMigrations } from '../integration/runMigrations.js';

const MIGRATION_TIMEOUT_MS = 60_000;
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const SHA256_BYTES = 32;
const RAW_CODE_BYTES = 6;
const SUCCESS = 0;
// node-pg-migrate's down takes a count; 0 reverts every applied migration.
const ALL_MIGRATIONS = '0';

const APPLICATION_TABLES = [
    'answer_events',
    'daily_goal_changes',
    'daily_progress',
    'entitlements',
    'one_time_codes',
    'purchase_events',
    'rate_limit_counters',
    'sessions',
    'users',
];

// Matches the pipeline's Docker tests: SKIP_DOCKER_TESTS=1 skips them unless
// TEST_DATABASE_URL names a database (CI's server-integration job).
const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;

async function tableNames(pool: pg.Pool): Promise<string[]> {
    const { rows } = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name <> 'pgmigrations'
         ORDER BY table_name`,
    );
    return rows.map(({ table_name: tableName }) => tableName);
}

async function columnsOf(pool: pg.Pool, table: string): Promise<Record<string, string>> {
    const { rows } = await pool.query<{ column_name: string; udt_name: string }>(
        `SELECT column_name, udt_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
    );
    return Object.fromEntries(rows.map(({ column_name: name, udt_name: type }) => [name, type]));
}

function migrateUp(): void {
    const { output, status } = runMigrations(scratch.databaseUrl, 'up');
    expect(status, output).toBe(SUCCESS);
}

async function insertUser(pool: pg.Pool, email = `learner-${randomUUID()}@example.test`): Promise<string> {
    const { rows } = await pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email]);
    const [{ id }] = rows;
    return id;
}

function insertAnswerEvent(pool: pg.Pool, userId: string, eventId: string): Promise<pg.QueryResult> {
    return pool.query(
        `INSERT INTO answer_events
           (user_id, event_id, question_id, bank_key, choice_index, is_correct, answered_at, round_kind)
         VALUES ($1, $2, 'py-easy-01', 'python/easy', 1, true, now(), 'bank')`,
        [userId, eventId],
    );
}

function insertPurchaseEvent(
    pool: pg.Pool,
    provider: string,
    providerEventId: string,
    userId: string | null = null,
): Promise<pg.QueryResult> {
    return pool.query(
        `INSERT INTO purchase_events (provider, provider_event_id, user_id, product_id, kind, payload, occurred_at)
         VALUES ($1, $2, $3, 'syntactical.python.medium', 'INITIAL_PURCHASE', '{}'::jsonb, now())`,
        [provider, providerEventId, userId],
    );
}

async function countRows(pool: pg.Pool, table: string, userId: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*) FROM ${table} WHERE user_id = $1`,
        [userId],
    );
    const [{ count }] = rows;
    return Number(count);
}

describe.skipIf(SKIP_DATABASE_TESTS)('migrations', () => {
    beforeEach(async () => {
        scratch = await createScratchDatabase(inject('testDatabaseUrl'));
    });

    afterEach(async () => {
        await scratch.drop();
    });

    it(
        'run up, down, and up again on an empty database',
        async () => {
            const firstUp = runMigrations(scratch.databaseUrl, 'up');
            expect(firstUp.status, firstUp.output).toBe(SUCCESS);
            expect(await tableNames(scratch.pool)).toEqual(APPLICATION_TABLES);

            const down = runMigrations(scratch.databaseUrl, 'down', [ALL_MIGRATIONS]);
            expect(down.status, down.output).toBe(SUCCESS);
            expect(await tableNames(scratch.pool)).toEqual([]);
            const { rows: leftovers } = await scratch.pool.query(
                `SELECT 'function' AS kind FROM pg_proc WHERE proname = 'set_updated_at'
                 UNION ALL SELECT 'extension' FROM pg_extension WHERE extname = 'citext'`,
            );
            expect(leftovers).toEqual([]);

            const secondUp = runMigrations(scratch.databaseUrl, 'up');
            expect(secondUp.status, secondUp.output).toBe(SUCCESS);
            expect(await tableNames(scratch.pool)).toEqual(APPLICATION_TABLES);
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'count an answer event once per user, while another user may reuse its event id',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const learner = await insertUser(pool);
            const otherLearner = await insertUser(pool);
            const eventId = randomUUID();

            await expect(insertAnswerEvent(pool, learner, eventId)).resolves.toMatchObject({ rowCount: 1 });
            await expect(insertAnswerEvent(pool, learner, eventId)).rejects.toMatchObject({
                code: UNIQUE_VIOLATION,
            });
            await expect(insertAnswerEvent(pool, otherLearner, eventId)).resolves.toMatchObject({ rowCount: 1 });
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'stamp answer_events.received_at by default with the insert time, not the transaction start',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const learner = await insertUser(pool);
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query('SELECT pg_sleep(0.05)');
                const { rows } = await client.query<{ is_after_start: boolean }>(
                    `INSERT INTO answer_events
                       (user_id, event_id, question_id, bank_key, choice_index, is_correct, answered_at, round_kind)
                     VALUES ($1, $2, 'py-easy-01', 'python/easy', 1, true, now(), 'bank')
                     RETURNING received_at > now() AS is_after_start`,
                    [learner, randomUUID()],
                );
                await client.query('ROLLBACK');
                expect(rows).toEqual([{ is_after_start: true }]);
            } finally {
                client.release();
            }
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'accept a daily goal of 10, 20, or 50 and refuse 15',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const learner = await insertUser(pool);
            const insertGoal = (fromDate: string, goal: number) =>
                pool.query('INSERT INTO daily_goal_changes (user_id, from_date, goal) VALUES ($1, $2, $3)', [
                    learner,
                    fromDate,
                    goal,
                ]);

            await expect(insertGoal('2026-10-01', 10)).resolves.toMatchObject({ rowCount: 1 });
            await expect(insertGoal('2026-10-02', 20)).resolves.toMatchObject({ rowCount: 1 });
            await expect(insertGoal('2026-10-03', 50)).resolves.toMatchObject({ rowCount: 1 });
            await expect(insertGoal('2026-10-04', 15)).rejects.toMatchObject({ code: CHECK_VIOLATION });
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'refuse a round kind or entitlement status outside its list',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const learner = await insertUser(pool);

            await expect(
                pool.query(
                    `INSERT INTO answer_events
                       (user_id, event_id, question_id, bank_key, choice_index, is_correct, answered_at, round_kind)
                     VALUES ($1, $2, 'py-easy-01', 'python/easy', 1, true, now(), 'practice')`,
                    [learner, randomUUID()],
                ),
            ).rejects.toMatchObject({ code: CHECK_VIOLATION });
            await expect(
                pool.query(
                    `INSERT INTO entitlements (user_id, product_id, status, source)
                     VALUES ($1, 'syntactical.python.medium', 'pending', 'app_store')`,
                    [learner],
                ),
            ).rejects.toMatchObject({ code: CHECK_VIOLATION });
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'record a purchase event once per provider event id',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const providerEventId = randomUUID();

            await expect(insertPurchaseEvent(pool, 'revenuecat', providerEventId)).resolves.toMatchObject({
                rowCount: 1,
            });
            await expect(insertPurchaseEvent(pool, 'revenuecat', providerEventId)).rejects.toMatchObject({
                code: UNIQUE_VIOLATION,
            });
            await expect(insertPurchaseEvent(pool, 'another-provider', providerEventId)).resolves.toMatchObject({
                rowCount: 1,
            });
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'keep one rate-limit counter per key and window',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const insertCounter = () =>
                pool.query(
                    `INSERT INTO rate_limit_counters (key, window_start, count)
                     VALUES ('codes:email:learner', '2026-10-03T10:00:00Z', 1)`,
                );

            await expect(insertCounter()).resolves.toMatchObject({ rowCount: 1 });
            await expect(insertCounter()).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'delete a user with their sessions, events, progress, and goal changes, keeping entitlements and purchase events',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const learner = await insertUser(pool);
            await pool.query(
                `INSERT INTO sessions (user_id, token_hash, expires_at)
                 VALUES ($1, $2, now() + interval '30 days')`,
                [learner, randomBytes(SHA256_BYTES)],
            );
            await insertAnswerEvent(pool, learner, randomUUID());
            await pool.query(
                `INSERT INTO daily_progress (user_id, local_date, xp, is_goal_met) VALUES ($1, '2026-10-03', 30, true)`,
                [learner],
            );
            await pool.query(
                `INSERT INTO daily_goal_changes (user_id, from_date, goal) VALUES ($1, '2026-10-03', 20)`,
                [learner],
            );
            const { rows: entitlementRows } = await pool.query<{ id: string }>(
                `INSERT INTO entitlements (user_id, product_id, status, source)
                 VALUES ($1, 'syntactical.python.medium', 'granted', 'app_store') RETURNING id`,
                [learner],
            );
            const [{ id: entitlementId }] = entitlementRows;
            const providerEventId = randomUUID();
            await insertPurchaseEvent(pool, 'revenuecat', providerEventId, learner);

            await pool.query('DELETE FROM users WHERE id = $1', [learner]);

            for (const table of ['sessions', 'answer_events', 'daily_progress', 'daily_goal_changes']) {
                expect(await countRows(pool, table, learner), table).toBe(0);
            }
            const { rows: keptEntitlements } = await pool.query('SELECT user_id FROM entitlements WHERE id = $1', [
                entitlementId,
            ]);
            expect(keptEntitlements).toEqual([{ user_id: null }]);
            const { rows: keptPurchases } = await pool.query(
                'SELECT user_id FROM purchase_events WHERE provider = $1 AND provider_event_id = $2',
                ['revenuecat', providerEventId],
            );
            expect(keptPurchases).toEqual([{ user_id: null }]);
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'store session tokens and one-time codes only as SHA-256 hashes',
        async () => {
            migrateUp();
            const { pool } = scratch;

            expect(await columnsOf(pool, 'sessions')).toEqual({
                auth_method: 'text',
                created_at: 'timestamptz',
                expires_at: 'timestamptz',
                id: 'uuid',
                last_used_at: 'timestamptz',
                revoked_at: 'timestamptz',
                token_hash: 'bytea',
                user_id: 'uuid',
            });
            expect(await columnsOf(pool, 'one_time_codes')).toEqual({
                attempts: 'int4',
                code_hash: 'bytea',
                created_at: 'timestamptz',
                email: 'citext',
                expires_at: 'timestamptz',
                id: 'uuid',
                invalidated_at: 'timestamptz',
                used_at: 'timestamptz',
            });

            const learner = await insertUser(pool);
            const tokenHash = randomBytes(SHA256_BYTES);
            const insertSession = (hash: Buffer) =>
                pool.query(
                    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 days')`,
                    [learner, hash],
                );
            await expect(insertSession(tokenHash)).resolves.toMatchObject({ rowCount: 1 });
            await expect(insertSession(tokenHash)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
            await expect(insertSession(randomBytes(RAW_CODE_BYTES))).rejects.toMatchObject({ code: CHECK_VIOLATION });

            const insertCode = (hash: Buffer) =>
                pool.query(
                    `INSERT INTO one_time_codes (email, code_hash, expires_at)
                     VALUES ('learner@example.test', $1, now() + interval '10 minutes')`,
                    [hash],
                );
            await expect(insertCode(randomBytes(SHA256_BYTES))).resolves.toMatchObject({ rowCount: 1 });
            await expect(insertCode(randomBytes(RAW_CODE_BYTES))).rejects.toMatchObject({ code: CHECK_VIOLATION });
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'treat emails case-insensitively',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const local = `learner-${randomUUID()}`;
            const learner = await insertUser(pool, `${local}@example.test`);

            expect(await columnsOf(pool, 'users')).toMatchObject({ email: 'citext', timezone: 'text' });
            await expect(insertUser(pool, `${local.toUpperCase()}@EXAMPLE.TEST`)).rejects.toMatchObject({
                code: UNIQUE_VIOLATION,
            });
            const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [
                `${local.toUpperCase()}@Example.Test`,
            ]);
            expect(rows).toEqual([{ id: learner }]);
        },
        MIGRATION_TIMEOUT_MS,
    );
    it(
        'refuse a negative attempt count, rate-limit count, XP, or choice index',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const learner = await insertUser(pool);

            await expect(
                pool.query(
                    `INSERT INTO one_time_codes (email, code_hash, expires_at, attempts)
                     VALUES ('learner@example.test', $1, now() + interval '10 minutes', -1)`,
                    [randomBytes(SHA256_BYTES)],
                ),
            ).rejects.toMatchObject({ code: CHECK_VIOLATION });
            await expect(
                pool.query(
                    `INSERT INTO rate_limit_counters (key, window_start, count)
                     VALUES ('codes:email:learner', '2026-10-03T10:00:00Z', -1)`,
                ),
            ).rejects.toMatchObject({ code: CHECK_VIOLATION });
            await expect(
                pool.query(
                    `INSERT INTO daily_progress (user_id, local_date, xp, is_goal_met) VALUES ($1, '2026-10-03', -1, false)`,
                    [learner],
                ),
            ).rejects.toMatchObject({ code: CHECK_VIOLATION });
            await expect(
                pool.query(
                    `INSERT INTO answer_events
                       (user_id, event_id, question_id, bank_key, choice_index, is_correct, answered_at, round_kind)
                     VALUES ($1, $2, 'py-easy-01', 'python/easy', -1, true, now(), 'bank')`,
                    [learner, randomUUID()],
                ),
            ).rejects.toMatchObject({ code: CHECK_VIOLATION });
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'keep one entitlement per user and product',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const learner = await insertUser(pool);
            const grant = () =>
                pool.query(
                    `INSERT INTO entitlements (user_id, product_id, status, source)
                     VALUES ($1, 'syntactical.python.medium', 'granted', 'app_store')`,
                    [learner],
                );

            await expect(grant()).resolves.toMatchObject({ rowCount: 1 });
            await expect(grant()).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
        },
        MIGRATION_TIMEOUT_MS,
    );

    it(
        'stamp entitlements.updated_at on update through the set_entitlements_updated_at trigger',
        async () => {
            migrateUp();
            const { pool } = scratch;
            const learner = await insertUser(pool);
            const { rows: triggers } = await pool.query(
                `SELECT tgname FROM pg_trigger
                 WHERE tgrelid = 'entitlements'::regclass AND NOT tgisinternal`,
            );
            expect(triggers).toEqual([{ tgname: 'set_entitlements_updated_at' }]);

            const { rows: inserted } = await pool.query<{ id: string }>(
                `INSERT INTO entitlements (user_id, product_id, status, source, updated_at)
                 VALUES ($1, 'syntactical.python.medium', 'granted', 'app_store', '2026-01-01T00:00:00Z')
                 RETURNING id`,
                [learner],
            );
            const [{ id }] = inserted;
            const { rows: updated } = await pool.query<{ is_stamped: boolean }>(
                `UPDATE entitlements SET status = 'revoked' WHERE id = $1
                 RETURNING updated_at > '2026-01-01T00:00:00Z' AS is_stamped`,
                [id],
            );
            expect(updated).toEqual([{ is_stamped: true }]);
        },
        MIGRATION_TIMEOUT_MS,
    );
});
