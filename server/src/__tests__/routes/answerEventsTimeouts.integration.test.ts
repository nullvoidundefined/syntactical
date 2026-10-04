// The upload and profile-update transactions run with a transaction-local lock timeout of 2 s
// (withTransaction with hasTimeouts). While another connection holds the user's row lock,
// POST /v1/answer-events and PATCH /v1/me wait for it, give up at the lock timeout, and answer
// 503 SERVER_BUSY, changing nothing; once the lock is released the same request succeeds.
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
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
// The lock timeout is 2 s: the 503 arrives after most of it and before the 5 s statement timeout.
const MIN_BUSY_ELAPSED_MS = 1_500;
const MAX_BUSY_ELAPSED_MS = 4_500;
const MINUTE_MS = 60_000;
const BANK_KEY = 'python/easy';
const QUESTION_ID = 'py-easy-001';
const DEFAULT_DAILY_GOAL = 20;
const NEW_DAILY_GOAL = 50;

const answerKey: AnswerKey = new Map([[BANK_KEY, new Map([[QUESTION_ID, { answerIndex: 2, choiceCount: 4 }]])]]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function countEvents(userId: string): Promise<number> {
    const { rows } = await database.pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM answer_events WHERE user_id = $1',
        [userId],
    );
    return Number(rows[0].count);
}

// Sends the request while another connection holds the user's row lock; returns the answer and
// how long it took.
async function sendWhileRowHeld(
    userId: string,
    send: () => PromiseLike<request.Response>,
): Promise<{ elapsedMs: number; response: request.Response }> {
    const holder = await database.pool.connect();
    try {
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const startedAt = Date.now();
        const response = await send();
        return { elapsedMs: Date.now() - startedAt, response };
    } finally {
        await holder.query('ROLLBACK');
        holder.release();
    }
}

function expectServerBusy({ elapsedMs, response }: { elapsedMs: number; response: request.Response }): void {
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(response.body.error.code).toBe('SERVER_BUSY');
    expect(elapsedMs).toBeGreaterThanOrEqual(MIN_BUSY_ELAPSED_MS);
    expect(elapsedMs).toBeLessThan(MAX_BUSY_ELAPSED_MS);
}

describe.skipIf(SKIP_DATABASE_TESTS)('transaction lock timeout', () => {
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
        'answers an upload blocked on a held user row lock with 503 SERVER_BUSY at the lock timeout, storing nothing, then 200 after release',
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
            const events = [
                {
                    answeredAt: new Date(now().getTime() - MINUTE_MS).toISOString(),
                    bankKey: BANK_KEY,
                    choiceIndex: 2,
                    eventId: randomUUID(),
                    questionId: QUESTION_ID,
                    roundKind: 'bank',
                },
            ];
            const upload = () =>
                request(app).post(UPLOAD_ROUTE).set('Authorization', `Bearer ${sessionToken}`).send({ events });

            expectServerBusy(await sendWhileRowHeld(userId, upload));
            expect(await countEvents(userId)).toBe(0);

            const retry = await upload();
            expect(retry.status).toBe(HTTP_OK);
            expect(retry.body.data.insertedCount).toBe(1);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'answers PATCH /v1/me blocked on a held user row lock with 503 SERVER_BUSY at the lock timeout, goal unchanged, then 200 after release',
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
            const authorization = `Bearer ${sessionToken}`;
            const patch = () => request(app).patch(ME_ROUTE).set('Authorization', authorization).send({ dailyGoal: NEW_DAILY_GOAL });

            expectServerBusy(await sendWhileRowHeld(userId, patch));
            const unchanged = await request(app).get(ME_ROUTE).set('Authorization', authorization);
            expect(unchanged.body.data.dailyGoal).toBe(DEFAULT_DAILY_GOAL);

            const retry = await patch();
            expect(retry.status).toBe(HTTP_OK);
            expect(retry.body.data.dailyGoal).toBe(NEW_DAILY_GOAL);
        },
        TEST_TIMEOUT_MS,
    );
});
