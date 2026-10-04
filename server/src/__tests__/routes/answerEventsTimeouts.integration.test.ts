// Every transaction runs with a transaction-local lock timeout of 2 s (withTransaction). While
// another connection holds the user's row lock, POST /v1/answer-events waits for it, gives up at
// the lock timeout, and answers 503 SERVER_BUSY, storing nothing; once the lock is released the
// same upload succeeds.
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const UPLOAD_ROUTE = '/v1/answer-events';
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

const answerKey: AnswerKey = new Map([[BANK_KEY, new Map([[QUESTION_ID, { answerIndex: 2, choiceCount: 4 }]])]]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function countEvents(userId: string): Promise<number> {
    const { rows } = await database.pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM answer_events WHERE user_id = $1',
        [userId],
    );
    return Number(rows[0].count);
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

            const holder = await database.pool.connect();
            let busy: request.Response;
            let elapsedMs: number;
            try {
                await holder.query('BEGIN');
                await holder.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
                const startedAt = Date.now();
                busy = await upload();
                elapsedMs = Date.now() - startedAt;
            } finally {
                await holder.query('ROLLBACK');
                holder.release();
            }

            expect(busy.status).toBe(HTTP_SERVICE_UNAVAILABLE);
            expect(busy.body.error.code).toBe('SERVER_BUSY');
            expect(elapsedMs).toBeGreaterThanOrEqual(MIN_BUSY_ELAPSED_MS);
            expect(elapsedMs).toBeLessThan(MAX_BUSY_ELAPSED_MS);
            expect(await countEvents(userId)).toBe(0);

            const retry = await upload();
            expect(retry.status).toBe(HTTP_OK);
            expect(retry.body.data.insertedCount).toBe(1);
        },
        TEST_TIMEOUT_MS,
    );
});
