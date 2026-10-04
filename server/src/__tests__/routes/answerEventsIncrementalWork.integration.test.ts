// R2 bounded work (owner decision 2026-10-03, PR #32): POST /v1/answer-events recomputes daily
// progress only for the questions and local dates the new events touch, so the answer_events
// rows the upload reads do not grow with the user's unrelated history. The measurement wraps
// the pool handed to the app and sums the rows every statement naming answer_events returns to
// the server (SELECT results and RETURNING rows alike). That count is deterministic: it does
// not depend on the planner, on statistics flush timing, or on other connections. The same
// small upload is sent by a user with no history and by a user with 10,000 unrelated stored
// events (other questions, other days); the second may read at most a small constant more.
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { withTransaction } from '../../clients/withTransaction.js';
import { recomputeDailyProgress } from '../../services/recomputeDailyProgress.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/answer-events';
const HTTP_OK = 200;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 120_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const EASY_BANK = 'python/easy';
const EASY_ANSWER_INDEX = 2;
const EASY_WRONG_INDEX = 0;
const NEW_QUESTION_IDS = ['py-easy-new-001', 'py-easy-new-002', 'py-easy-new-003'];
const UNRELATED_EVENT_COUNT = 10_000;
const UNRELATED_QUESTION_COUNT = 100;
const UNRELATED_FIRST_DAY_AGO = 2;
const UNRELATED_DAY_SPAN = 300;
const ROW_SLACK = 50;

const answerKey: AnswerKey = new Map([
    [
        EASY_BANK,
        new Map<string, AnswerKeyEntry>(
            NEW_QUESTION_IDS.map((id) => [id, { answerIndex: EASY_ANSWER_INDEX, choiceCount: 4 }] as const),
        ),
    ],
]);

interface RowCounter {
    answerEventRows: number;
}

type QueryArguments = Parameters<pg.Pool['query']>;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function readSqlText(first: unknown): string {
    if (typeof first === 'string') {
        return first;
    }
    if (typeof first === 'object' && first !== null && typeof (first as { text?: unknown }).text === 'string') {
        return (first as { text: string }).text;
    }
    return '';
}

function countReturnedRows(result: unknown): number {
    const results = Array.isArray(result) ? result : [result];
    return results.reduce<number>((sum, one) => {
        const rows = (one as { rows?: unknown } | undefined)?.rows;
        return sum + (Array.isArray(rows) ? rows.length : 0);
    }, 0);
}

function countingQuery(target: object, query: (...args: QueryArguments) => unknown, counter: RowCounter) {
    return async function countedQuery(...args: QueryArguments): Promise<unknown> {
        const result: unknown = await Reflect.apply(query, target, args);
        if (/\banswer_events\b/i.test(readSqlText(args[0]))) {
            counter.answerEventRows += countReturnedRows(result);
        }
        return result;
    };
}

function bindMember(target: object, property: string | symbol): unknown {
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
}

// A pool whose clients and direct queries add the rows of every answer_events statement to the counter.
function createCountingPool(pool: pg.Pool, counter: RowCounter): pg.Pool {
    function wrapClient(client: pg.PoolClient): pg.PoolClient {
        return new Proxy(client, {
            get(target, property) {
                if (property === 'query') {
                    return countingQuery(target, target.query as (...args: QueryArguments) => unknown, counter);
                }
                return bindMember(target, property);
            },
        });
    }
    return new Proxy(pool, {
        get(target, property) {
            if (property === 'query') {
                return countingQuery(target, target.query as (...args: QueryArguments) => unknown, counter);
            }
            if (property === 'connect') {
                return async function connect(): Promise<pg.PoolClient> {
                    return wrapClient(await target.connect());
                };
            }
            return bindMember(target, property);
        },
    });
}

async function signIn(now: Date): Promise<{ authorization: string; userId: string }> {
    const { sessionToken, userId } = await insertSession(database.pool, {
        createdAt: now,
    });
    await database.pool.query('UPDATE users SET created_at = $2 WHERE id = $1', [
        userId,
        new Date(now.getTime() - 30 * DAY_MS),
    ]);
    return { authorization: `Bearer ${sessionToken}`, userId };
}

// 10,000 stored events on questions the upload never names, spread over days 2 to 301 ago, with
// misses and review rounds, and daily_progress rebuilt by the full replay as if they had been
// uploaded. Seeded through SQL because uploading them would take 50 batches.
async function storeUnrelatedHistory(userId: string, now: Date): Promise<void> {
    await database.pool.query(
        `INSERT INTO answer_events
           (user_id, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct)
         SELECT $1, gen_random_uuid(), $2,
                'py-easy-unrelated-' || lpad((n % $3)::text, 3, '0'),
                CASE WHEN n % 4 = 0 THEN $4::int ELSE $5::int END,
                $6::timestamptz - make_interval(days => $7 + (n % $8)) - make_interval(mins => n % 600),
                CASE WHEN n % 3 = 0 THEN 'review' ELSE 'bank' END,
                n % 4 <> 0
         FROM generate_series(1, $9::int) AS n`,
        [
            userId,
            EASY_BANK,
            UNRELATED_QUESTION_COUNT,
            EASY_WRONG_INDEX,
            EASY_ANSWER_INDEX,
            now,
            UNRELATED_FIRST_DAY_AGO,
            UNRELATED_DAY_SPAN,
            UNRELATED_EVENT_COUNT,
        ],
    );
    await withTransaction(database.pool, async (client) => {
        await recomputeDailyProgress(client, userId, null, now);
    });
}

function buildTodayEvents(now: Date) {
    return NEW_QUESTION_IDS.map((questionId, index) => ({
        answeredAt: new Date(now.getTime() - (index + 1) * MINUTE_MS).toISOString(),
        bankKey: EASY_BANK,
        choiceIndex: EASY_ANSWER_INDEX,
        eventId: randomUUID(),
        questionId,
        roundKind: 'bank' as const,
    }));
}

async function measureUpload(withHistory: boolean): Promise<number> {
    const counter: RowCounter = { answerEventRows: 0 };
    const { app, now } = createSyncTestApp({
        answerKey,
        pool: createCountingPool(database.pool, counter),
    });
    const { authorization, userId } = await signIn(now());
    if (withHistory) {
        await storeUnrelatedHistory(userId, now());
    }
    counter.answerEventRows = 0;

    const response = await request(app)
        .post(ROUTE)
        .set('Authorization', authorization)
        .send({ events: buildTodayEvents(now()) });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.data.insertedCount).toBe(NEW_QUESTION_IDS.length);
    return counter.answerEventRows;
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/answer-events incremental recompute work', () => {
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
        'reads no more answer_events rows for a 3-event upload of new questions today with 10,000 unrelated stored events than with none',
        async () => {
            const rowsWithoutHistory = await measureUpload(false);
            const rowsWithHistory = await measureUpload(true);

            expect(rowsWithHistory).toBeLessThanOrEqual(rowsWithoutHistory + ROW_SLACK);
        },
        TEST_TIMEOUT_MS,
    );
});
