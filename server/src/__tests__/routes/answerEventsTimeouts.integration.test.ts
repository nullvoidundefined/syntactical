// R1b: the upload and profile-update transactions run with SET LOCAL statement_timeout = '5s',
// lock_timeout = '2s', and idle_in_transaction_session_timeout = '10s'. While another
// connection holds a table lock the transaction needs (the user row lock itself is free, so
// this is not the 429 SYNC_USER_BUSY path), POST /v1/answer-events and PATCH /v1/me answer
// 503 SERVER_BUSY with a Retry-After header in about the lock timeout instead of waiting,
// roll back, and release the pooled client; after the lock is released the same request
// succeeds. The settings are transaction-local: they never leak onto a pooled connection.
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const UPLOAD_ROUTE = '/v1/answer-events';
const ME_ROUTE = '/v1/me';
const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
// The lock timeout is 2 s: a 503 must arrive no sooner than most of it and well before the
// 5 s statement timeout would have been the cause.
const MIN_BUSY_ELAPSED_MS = 1_500;
const MAX_BUSY_ELAPSED_MS = 4_500;
// How long the test waits for an answer while the lock is held before recording none; above
// the upper bound so a slow 503 is reported as slow rather than as missing.
const WAIT_DEADLINE_MS = 6_000;
const RELEASE_POLL_MS = 25;
const RELEASE_DEADLINE_MS = 1_000;
const MINUTE_MS = 60_000;
const BATCH_SIZE = 5;
const BANK_KEY = 'python/easy';
const QUESTION_IDS = ['py-easy-001', 'py-easy-002', 'py-easy-003', 'py-easy-004', 'py-easy-005'];
const CHOICE_COUNT = 4;
const ANSWER_INDEX = 2;
const DEFAULT_DAILY_GOAL = 20;
const NEW_DAILY_GOAL = 50;
const RETRY_AFTER_SECONDS = /^[1-9]\d*$/;
const TIMEOUT_SETTINGS = ['statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout'] as const;

const answerKey: AnswerKey = new Map([
    [
        BANK_KEY,
        new Map<string, AnswerKeyEntry>(
            QUESTION_IDS.map((id) => [id, { answerIndex: ANSWER_INDEX, choiceCount: CHOICE_COUNT }] as const),
        ),
    ],
]);

interface UploadEvent {
    answeredAt: string;
    bankKey: string;
    choiceIndex: number;
    eventId: string;
    questionId: string;
    roundKind: 'bank' | 'review' | 'topic';
}

interface Timed<T> {
    elapsedMs: number;
    // Resolves once the request finishes, however late; awaited after the lock is released so
    // no request outlives its test.
    settled: Promise<T | undefined>;
    value: T | undefined;
}

type TimedAnswer = Timed<request.Response>;

type App = Parameters<typeof request>[0];

type TimeoutSettings = Record<(typeof TIMEOUT_SETTINGS)[number], string>;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function signIn(now: Date): Promise<{ authorization: string; userId: string }> {
    const { sessionToken, userId } = await insertSession(database.pool, {
        createdAt: now,
    });
    return { authorization: `Bearer ${sessionToken}`, userId };
}

function buildBatch(count: number, startMs: number): UploadEvent[] {
    return Array.from({ length: count }, (_, index) => ({
        answeredAt: new Date(startMs - index * MINUTE_MS).toISOString(),
        bankKey: BANK_KEY,
        choiceIndex: index % 3 === 0 ? 0 : ANSWER_INDEX,
        eventId: randomUUID(),
        questionId: QUESTION_IDS[index % QUESTION_IDS.length],
        roundKind: 'bank',
    }));
}

function upload(app: App, authorization: string, events: UploadEvent[]) {
    return request(app).post(UPLOAD_ROUTE).set('Authorization', authorization).send({ events });
}

function patchMe(app: App, authorization: string, body: Record<string, unknown>) {
    return request(app).patch(ME_ROUTE).set('Authorization', authorization).send(body);
}

// Sends the request and waits for its answer up to deadlineMs, never longer.
async function answerWithin<T>(call: PromiseLike<T>, deadlineMs: number): Promise<Timed<T>> {
    const startedAt = Date.now();
    const settled = Promise.resolve(call).then(
        (value) => value,
        () => undefined,
    );
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), deadlineMs);
    });
    const value = await Promise.race([settled, deadline]);
    clearTimeout(timer);
    return { elapsedMs: Date.now() - startedAt, settled, value };
}

// Opens a transaction on a dedicated connection holding an ACCESS EXCLUSIVE lock on a table
// the sync transaction writes, leaving the user row lock free.
async function holdTableLock(table: 'daily_goal_changes' | 'daily_progress'): Promise<pg.PoolClient> {
    const holder = await database.pool.connect();
    await holder.query('BEGIN');
    await holder.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    return holder;
}

async function releaseTableLock(holder: pg.PoolClient): Promise<void> {
    try {
        await holder.query('ROLLBACK');
    } finally {
        holder.release();
    }
}

async function countEvents(userId: string): Promise<number> {
    const { rows } = await database.pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM answer_events WHERE user_id = $1',
        [userId],
    );
    return Number(rows[0].count);
}

// True once every client the pool has opened is back in its idle list, so none was leaked.
async function allClientsReleased(): Promise<boolean> {
    const deadline = Date.now() + RELEASE_DEADLINE_MS;
    while (Date.now() < deadline) {
        if (database.pool.idleCount === database.pool.totalCount && database.pool.waitingCount === 0) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, RELEASE_POLL_MS));
    }
    return database.pool.idleCount === database.pool.totalCount;
}

async function readTimeoutSettings(client: pg.Pool | pg.PoolClient): Promise<TimeoutSettings> {
    const settings = {} as TimeoutSettings;
    for (const name of TIMEOUT_SETTINGS) {
        const { rows }: pg.QueryResult<Record<string, string>> = await client.query(`SHOW ${name}`);
        settings[name] = rows[0][name];
    }
    return settings;
}

function expectServerBusy(answer: TimedAnswer): void {
    expect(answer.value?.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    const response = answer.value as request.Response;
    expect(response.body.error.code).toBe('SERVER_BUSY');
    expect(response.body.data).toBeUndefined();
    expect(response.headers['retry-after']).toMatch(RETRY_AFTER_SECONDS);
    expect(answer.elapsedMs).toBeGreaterThanOrEqual(MIN_BUSY_ELAPSED_MS);
    expect(answer.elapsedMs).toBeLessThan(MAX_BUSY_ELAPSED_MS);
}

describe.skipIf(SKIP_DATABASE_TESTS)('timeouts on the upload and profile-update transactions', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it(
        'answers an upload blocked on a held daily_progress lock with 503 SERVER_BUSY and Retry-After in about the lock timeout, storing nothing, then 200 after release',
        async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const batch = buildBatch(BATCH_SIZE, now().getTime() - MINUTE_MS);

            const holder = await holdTableLock('daily_progress');
            let answer: TimedAnswer | undefined;
            let eventsWhileHeld: number;
            try {
                answer = await answerWithin(upload(app, authorization, batch), WAIT_DEADLINE_MS);
                eventsWhileHeld = await countEvents(userId);
            } finally {
                await releaseTableLock(holder);
                await answer?.settled;
            }

            expectServerBusy(answer);
            expect(eventsWhileHeld).toBe(0);
            expect(await countEvents(userId)).toBe(0);
            expect(await allClientsReleased()).toBe(true);

            const retry = await answerWithin(upload(app, authorization, batch), WAIT_DEADLINE_MS);
            expect(retry.value?.status).toBe(HTTP_OK);
            expect(retry.value?.body.data.insertedCount).toBe(batch.length);
            expect(await countEvents(userId)).toBe(batch.length);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'answers a dailyGoal PATCH blocked on a held daily_goal_changes lock with 503 SERVER_BUSY and Retry-After in about the lock timeout, goal unchanged, then 200 after release',
        async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization } = await signIn(now());

            const holder = await holdTableLock('daily_goal_changes');
            let answer: TimedAnswer | undefined;
            try {
                answer = await answerWithin(
                    patchMe(app, authorization, { dailyGoal: NEW_DAILY_GOAL }),
                    WAIT_DEADLINE_MS,
                );
            } finally {
                await releaseTableLock(holder);
                await answer?.settled;
            }

            expectServerBusy(answer);
            const unchanged = await request(app).get(ME_ROUTE).set('Authorization', authorization);
            expect(unchanged.status).toBe(HTTP_OK);
            expect(unchanged.body.data.dailyGoal).toBe(DEFAULT_DAILY_GOAL);
            expect(await allClientsReleased()).toBe(true);

            const retry = await answerWithin(
                patchMe(app, authorization, { dailyGoal: NEW_DAILY_GOAL }),
                WAIT_DEADLINE_MS,
            );
            expect(retry.value?.status).toBe(HTTP_OK);
            expect(retry.value?.body.data.dailyGoal).toBe(NEW_DAILY_GOAL);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'leaves the server default timeouts on every pooled connection after an upload and a profile update',
        async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization } = await signIn(now());
            const defaults = await readTimeoutSettings(database.pool);

            const uploaded = await upload(app, authorization, buildBatch(BATCH_SIZE, now().getTime() - MINUTE_MS));
            const patched = await patchMe(app, authorization, {
                dailyGoal: NEW_DAILY_GOAL,
            });
            expect(uploaded.status).toBe(HTTP_OK);
            expect(patched.status).toBe(HTTP_OK);
            expect(await allClientsReleased()).toBe(true);

            // Check out every idle client at once so the one the requests used is among them.
            const clients = await Promise.all(
                Array.from({ length: database.pool.idleCount }, () => database.pool.connect()),
            );
            try {
                expect(clients.length).toBeGreaterThan(0);
                for (const client of clients) {
                    expect(await readTimeoutSettings(client)).toEqual(defaults);
                }
            } finally {
                clients.forEach((client) => client.release());
            }
        },
        TEST_TIMEOUT_MS,
    );
});
