// R1c (B-32, B-36): at most one upload or profile update is in flight per user. The user row
// lock is taken without waiting, so while another transaction holds it POST /v1/answer-events
// and PATCH /v1/me answer 429 SYNC_USER_BUSY at once with a Retry-After header in seconds,
// storing nothing and releasing the pooled client; a later retry succeeds. Another user's
// upload is never blocked by that lock, and a burst of parallel overlapping uploads for one
// user answers only 200 or 429 and converges to the totals of one full upload on retry.
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
const HTTP_TOO_MANY_REQUESTS = 429;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 60_000;
const BUSY_ANSWER_LIMIT_MS = 1_000;
// How long a request may take before the test stops waiting for it and records no answer;
// above the busy limit so a slow 429 is reported as slow rather than as missing.
const WAIT_DEADLINE_MS = 3_000;
const PARALLEL_DEADLINE_MS = 15_000;
// pg.Pool's default size is 10 and the test's own lock holder takes one; more busy answers
// than that in a row can only all arrive if each request gives its client back.
const POOL_DEFAULT_MAX = 10;
const BUSY_ATTEMPTS = POOL_DEFAULT_MAX + 2;
const PARALLEL_UPLOADS = 8;
const BATCH_STRIDE = 4;
const BATCH_SIZE = 12;
const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;
const BANK_KEY = 'python/easy';
const QUESTION_IDS = ['py-easy-001', 'py-easy-002', 'py-easy-003', 'py-easy-004', 'py-easy-005'];
const CHOICE_COUNT = 4;
const ANSWER_INDEX = 2;
const DEFAULT_DAILY_GOAL = 20;
const NEW_DAILY_GOAL = 50;
const NEW_TIMEZONE = 'Pacific/Auckland';
const RETRY_AFTER_SECONDS = /^[1-9]\d*$/;

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

interface ProgressRow {
    is_goal_met: boolean;
    local_date: string;
    xp: number;
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

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function signIn(now: Date): Promise<{ authorization: string; userId: string }> {
    const { sessionToken, userId } = await insertSession(database.pool, {
        createdAt: now,
    });
    return { authorization: `Bearer ${sessionToken}`, userId };
}

// count events answered from startMs backwards a minute apart, some right and some wrong.
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

// Opens a transaction on a dedicated connection holding the user's row lock, as a concurrent
// upload or profile update would.
async function holdUserLock(userId: string): Promise<pg.PoolClient> {
    const holder = await database.pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
    return holder;
}

async function releaseUserLock(holder: pg.PoolClient): Promise<void> {
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

async function readProgress(userId: string): Promise<ProgressRow[]> {
    const { rows } = await database.pool.query<ProgressRow>(
        `SELECT to_char(local_date, 'YYYY-MM-DD') AS local_date, xp, is_goal_met
           FROM daily_progress WHERE user_id = $1 ORDER BY local_date`,
        [userId],
    );
    return rows;
}

function expectBusy(answer: TimedAnswer): void {
    expect(answer.value?.status).toBe(HTTP_TOO_MANY_REQUESTS);
    const response = answer.value as request.Response;
    expect(response.body.error.code).toBe('SYNC_USER_BUSY');
    expect(response.body.data).toBeUndefined();
    expect(response.headers['retry-after']).toMatch(RETRY_AFTER_SECONDS);
    expect(answer.elapsedMs).toBeLessThan(BUSY_ANSWER_LIMIT_MS);
}

// Sends BUSY_ATTEMPTS requests one after another while the lock is held, stopping at the first
// that is not a prompt 429 so a blocking route leaves at most one request waiting.
async function sendWhileHeld(send: () => PromiseLike<request.Response>): Promise<TimedAnswer[]> {
    const answers: TimedAnswer[] = [];
    for (let attempt = 0; attempt < BUSY_ATTEMPTS; attempt += 1) {
        const answer = await answerWithin(send(), WAIT_DEADLINE_MS);
        answers.push(answer);
        if (answer.value?.status !== HTTP_TOO_MANY_REQUESTS) {
            break;
        }
    }
    return answers;
}

describe.skipIf(SKIP_DATABASE_TESTS)('one upload or profile update in flight per user', () => {
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
        'answers an upload for a user whose row lock is held with a prompt 429 SYNC_USER_BUSY and Retry-After, storing nothing, then 200 on retry after release',
        async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const batch = buildBatch(5, now().getTime() - MINUTE_MS);

            const holder = await holdUserLock(userId);
            let answers: TimedAnswer[] = [];
            let eventsWhileHeld: number;
            let progressWhileHeld: ProgressRow[];
            try {
                answers = await sendWhileHeld(() => upload(app, authorization, batch));
                eventsWhileHeld = await countEvents(userId);
                progressWhileHeld = await readProgress(userId);
            } finally {
                await releaseUserLock(holder);
                await Promise.all(answers.map((answer) => answer.settled));
            }

            answers.forEach(expectBusy);
            expect(answers).toHaveLength(BUSY_ATTEMPTS);
            expect(eventsWhileHeld).toBe(0);
            expect(progressWhileHeld).toEqual([]);

            const retry = await answerWithin(upload(app, authorization, batch), WAIT_DEADLINE_MS);
            expect(retry.value?.status).toBe(HTTP_OK);
            expect(retry.value?.body.data.insertedCount).toBe(batch.length);
            expect(await countEvents(userId)).toBe(batch.length);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'answers PATCH /v1/me for a user whose row lock is held with a prompt 429 SYNC_USER_BUSY and Retry-After, leaving the goal and timezone unchanged, then 200 on retry after release',
        async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const update = { dailyGoal: NEW_DAILY_GOAL, timezone: NEW_TIMEZONE };

            const holder = await holdUserLock(userId);
            let answers: TimedAnswer[] = [];
            let goalChangesWhileHeld: number;
            let timezoneWhileHeld: string | null;
            try {
                answers = await sendWhileHeld(() => patchMe(app, authorization, update));
                const goalChanges = await database.pool.query('SELECT 1 FROM daily_goal_changes WHERE user_id = $1', [
                    userId,
                ]);
                goalChangesWhileHeld = goalChanges.rowCount ?? 0;
                const { rows } = await database.pool.query<{
                    timezone: string | null;
                }>('SELECT timezone FROM users WHERE id = $1', [userId]);
                timezoneWhileHeld = rows[0].timezone;
            } finally {
                await releaseUserLock(holder);
                await Promise.all(answers.map((answer) => answer.settled));
            }

            answers.forEach(expectBusy);
            expect(answers).toHaveLength(BUSY_ATTEMPTS);
            expect(goalChangesWhileHeld).toBe(0);
            expect(timezoneWhileHeld).toBeNull();

            const retry = await answerWithin(patchMe(app, authorization, update), WAIT_DEADLINE_MS);
            expect(retry.value?.status).toBe(HTTP_OK);
            expect(retry.value?.body.data).toMatchObject({
                dailyGoal: NEW_DAILY_GOAL,
                timezone: NEW_TIMEZONE,
            });
            const profile = await request(app).get(ME_ROUTE).set('Authorization', authorization);
            expect(profile.status).toBe(HTTP_OK);
            expect(profile.body.data.dailyGoal).toBe(NEW_DAILY_GOAL);
            expect(profile.body.data.dailyGoal).not.toBe(DEFAULT_DAILY_GOAL);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        "answers another user's upload with 200 while one user's row lock is held",
        async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const locked = await signIn(now());
            const other = await signIn(now());
            const batch = buildBatch(5, now().getTime() - MINUTE_MS);

            const holder = await holdUserLock(locked.userId);
            let pending: TimedAnswer | undefined;
            try {
                pending = await answerWithin(upload(app, other.authorization, batch), WAIT_DEADLINE_MS);
            } finally {
                await releaseUserLock(holder);
                await pending?.settled;
            }
            const answer = pending;

            expect(answer.value?.status).toBe(HTTP_OK);
            expect(answer.value?.body.data.insertedCount).toBe(batch.length);
            expect(answer.elapsedMs).toBeLessThan(BUSY_ANSWER_LIMIT_MS);
            expect(await countEvents(other.userId)).toBe(batch.length);
            expect(await countEvents(locked.userId)).toBe(0);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'answers 8 parallel overlapping uploads for one user with only 200 or 429, and sequential retries converge to one full upload',
        async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const reference = await signIn(now());
            const distinct = buildBatch(
                BATCH_STRIDE * (PARALLEL_UPLOADS - 1) + BATCH_SIZE,
                now().getTime() - SECOND_MS,
            );
            const batches = Array.from({ length: PARALLEL_UPLOADS }, (_, index) =>
                distinct.slice(index * BATCH_STRIDE, index * BATCH_STRIDE + BATCH_SIZE),
            );

            const parallel = await answerWithin(
                Promise.all(batches.map((batch) => upload(app, authorization, batch))),
                PARALLEL_DEADLINE_MS,
            );
            expect(parallel.value).toBeDefined();
            const responses = parallel.value as request.Response[];
            for (const response of responses) {
                expect([HTTP_OK, HTTP_TOO_MANY_REQUESTS]).toContain(response.status);
                if (response.status === HTTP_TOO_MANY_REQUESTS) {
                    expect(response.body.error.code).toBe('SYNC_USER_BUSY');
                    expect(response.headers['retry-after']).toMatch(RETRY_AFTER_SECONDS);
                }
            }
            const accepted = responses.filter((response) => response.status === HTTP_OK);
            expect(accepted.length).toBeGreaterThanOrEqual(1);

            const retries: request.Response[] = [];
            for (const batch of batches) {
                retries.push(await upload(app, authorization, batch));
            }
            expect(retries.map((response) => response.status)).toEqual(batches.map(() => HTTP_OK));

            const insertedTotal = [...accepted, ...retries].reduce(
                (sum, response) => sum + Number(response.body.data.insertedCount),
                0,
            );
            expect(insertedTotal).toBe(distinct.length);
            const { rows } = await database.pool.query<{
                copies: string;
                event_id: string;
            }>('SELECT event_id, COUNT(*) AS copies FROM answer_events WHERE user_id = $1 GROUP BY event_id', [userId]);
            expect(rows.map((row) => row.event_id).sort()).toEqual(distinct.map((event) => event.eventId).sort());
            expect(rows.every((row) => Number(row.copies) === 1)).toBe(true);

            const single = await upload(app, reference.authorization, distinct);
            expect(single.status).toBe(HTTP_OK);
            expect(await readProgress(userId)).toEqual(await readProgress(reference.userId));
            const lastRetry = retries[retries.length - 1];
            expect(lastRetry.body.data.xpTotal).toBe(single.body.data.xpTotal);
            const profile = await request(app).get(ME_ROUTE).set('Authorization', authorization);
            const referenceProfile = await request(app).get(ME_ROUTE).set('Authorization', reference.authorization);
            expect(profile.body.data.xpTotal).toBe(referenceProfile.body.data.xpTotal);
            expect(profile.body.data.xpTotal).toBeGreaterThan(0);
        },
        TEST_TIMEOUT_MS,
    );
});
