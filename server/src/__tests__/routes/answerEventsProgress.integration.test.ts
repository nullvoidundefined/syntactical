// Guard tests for behavior that landed with B-32 (Task 3.7, B-34, decisions 23 and 24): they
// pass against the current code and fail if the behavior is removed. POST /v1/answer-events
// rejects a whole batch (422 SYNC_TIMESTAMP_OUT_OF_RANGE, nothing stored) when an answeredAt is
// more than 5 minutes after the server clock or before the user's created_at minus 365 days;
// it recomputes daily_progress with @syntactical/progress in the same transaction (user
// timezone, goal history, due-review bonus); concurrent overlapping uploads store each event
// once and leave the totals the package computes; a rejected batch leaves daily_progress as it was.
import { randomUUID } from 'node:crypto';

import {
    computeDailyProgress,
    computeXp,
    findDueReviewEventIds,
    REVIEW_BONUS_XP,
    toLocalDate,
    XP_BY_DIFFICULTY,
} from '@syntactical/progress';
import type { AnswerEvent, GoalChange } from '@syntactical/progress';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/answer-events';
const HTTP_OK = 200;
const HTTP_UNPROCESSABLE = 422;
const SETUP_TIMEOUT_MS = 120_000;
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const FUTURE_TOLERANCE_MS = 5 * MINUTE_MS;
const PAST_TOLERANCE_MS = 365 * DAY_MS;
const EASY_BANK = 'python/easy';
const MEDIUM_BANK = 'python/medium';
const EASY_QUESTION_IDS = ['py-easy-001', 'py-easy-002', 'py-easy-003', 'py-easy-004', 'py-easy-005'];
const MEDIUM_QUESTION_ID = 'py-medium-001';
const EASY_ANSWER_INDEX = 2;
const EASY_WRONG_INDEX = 0;
const MEDIUM_ANSWER_INDEX = 1;
const MEDIUM_WRONG_INDEX = 0;
const AUCKLAND = 'Pacific/Auckland';
const CONCURRENT_ROUNDS = 5;

const answerKey: AnswerKey = new Map([
    [
        EASY_BANK,
        new Map<string, AnswerKeyEntry>(
            EASY_QUESTION_IDS.map((id) => [id, { answerIndex: EASY_ANSWER_INDEX, choiceCount: 4 }] as const),
        ),
    ],
    [
        MEDIUM_BANK,
        new Map<string, AnswerKeyEntry>([[MEDIUM_QUESTION_ID, { answerIndex: MEDIUM_ANSWER_INDEX, choiceCount: 3 }]]),
    ],
]);

interface WireEvent {
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

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function at(milliseconds: number): string {
    return new Date(milliseconds).toISOString();
}

function buildEvent(answeredAt: string, overrides: Partial<WireEvent> = {}): WireEvent {
    return {
        answeredAt,
        bankKey: EASY_BANK,
        choiceIndex: EASY_ANSWER_INDEX,
        eventId: randomUUID(),
        questionId: EASY_QUESTION_IDS[0],
        roundKind: 'bank',
        ...overrides,
    };
}

async function signIn(now: Date): Promise<{ authorization: string; userId: string }> {
    const { sessionToken, userId } = await insertSession(database.pool, {
        createdAt: now,
    });
    return { authorization: `Bearer ${sessionToken}`, userId };
}

async function setUserCreatedAt(userId: string, createdAt: Date): Promise<void> {
    await database.pool.query('UPDATE users SET created_at = $2 WHERE id = $1', [userId, createdAt]);
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

async function storedXpTotal(userId: string): Promise<number> {
    return (await readProgress(userId)).reduce((sum, row) => sum + row.xp, 0);
}

async function readStoredEvents(userId: string): Promise<AnswerEvent[]> {
    const { rows } = await database.pool.query<{
        answered_at: Date;
        bank_key: string;
        choice_index: number;
        event_id: string;
        is_correct: boolean;
        question_id: string;
        round_kind: AnswerEvent['roundKind'];
    }>(
        `SELECT event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct
     FROM answer_events WHERE user_id = $1 ORDER BY answered_at, event_id`,
        [userId],
    );
    return rows.map((row) => ({
        answeredAt: row.answered_at.toISOString(),
        bankKey: row.bank_key,
        choiceIndex: row.choice_index,
        eventId: row.event_id,
        isCorrect: row.is_correct,
        questionId: row.question_id,
        roundKind: row.round_kind,
    }));
}

function sorted(values: string[]): string[] {
    return [...values].sort();
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/answer-events timestamps and daily progress', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    describe('timestamp bounds', () => {
        it('rejects a batch with an answeredAt past now + 5 min or before created_at - 365 days with 422 naming exactly those events, storing none', async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const createdAt = new Date(now().getTime() - 30 * DAY_MS);
            await setUserCreatedAt(userId, createdAt);
            const latest = now().getTime() + FUTURE_TOLERANCE_MS;
            const earliest = createdAt.getTime() - PAST_TOLERANCE_MS;
            const justFuture = buildEvent(at(latest + 1));
            const farFuture = buildEvent(at(latest + DAY_MS));
            const justPast = buildEvent(at(earliest - 1), {
                questionId: EASY_QUESTION_IDS[1],
            });
            const valid = [buildEvent(at(now().getTime() - MINUTE_MS)), buildEvent(at(earliest + DAY_MS))];
            const events = [valid[0], justFuture, justPast, valid[1], farFuture];

            const response = await request(app).post(ROUTE).set('Authorization', authorization).send({ events });

            expect(response.status).toBe(HTTP_UNPROCESSABLE);
            expect(response.body.error.code).toBe('SYNC_TIMESTAMP_OUT_OF_RANGE');
            expect(sorted(response.body.error.eventIds)).toEqual(
                sorted([justFuture.eventId, farFuture.eventId, justPast.eventId]),
            );
            expect(await countEvents(userId)).toBe(0);
        });

        it('rejects a batch whose only out-of-range event is before created_at - 365 days, though it is within a year of now', async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            // created_at is 10 days ago, so the bound is 375 days ago; 370 days ago is accepted and
            // 376 days ago is not, whatever "now - 365 days" would say.
            await setUserCreatedAt(userId, new Date(now().getTime() - 10 * DAY_MS));
            const accepted = buildEvent(at(now().getTime() - 370 * DAY_MS));
            const rejected = buildEvent(at(now().getTime() - 376 * DAY_MS));

            const response = await request(app)
                .post(ROUTE)
                .set('Authorization', authorization)
                .send({ events: [accepted, rejected] });

            expect(response.status).toBe(HTTP_UNPROCESSABLE);
            expect(response.body.error.code).toBe('SYNC_TIMESTAMP_OUT_OF_RANGE');
            expect(response.body.error.eventIds).toEqual([rejected.eventId]);
            expect(await countEvents(userId)).toBe(0);
        });

        it('accepts events exactly at now + 5 min and exactly at created_at - 365 days', async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const createdAt = new Date(now().getTime() - 30 * DAY_MS);
            await setUserCreatedAt(userId, createdAt);
            const atLatest = buildEvent(at(now().getTime() + FUTURE_TOLERANCE_MS));
            const atEarliest = buildEvent(at(createdAt.getTime() - PAST_TOLERANCE_MS), {
                questionId: EASY_QUESTION_IDS[1],
            });

            const response = await request(app)
                .post(ROUTE)
                .set('Authorization', authorization)
                .send({ events: [atLatest, atEarliest] });

            expect(response.status).toBe(HTTP_OK);
            expect(response.body.data.insertedCount).toBe(2);
            expect(await countEvents(userId)).toBe(2);
        });
    });

    describe('daily progress recompute', () => {
        it('stores daily_progress equal to computeDailyProgress in the user timezone with the goal history, an 11:05Z Auckland event landing on the next local date', async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            await setUserCreatedAt(userId, new Date('2026-10-01T00:00:00.000Z'));
            await database.pool.query('UPDATE users SET timezone = $2 WHERE id = $1', [userId, AUCKLAND]);
            await database.pool.query('INSERT INTO daily_goal_changes (user_id, from_date, goal) VALUES ($1, $2, $3)', [
                userId,
                '2026-09-01',
                10,
            ]);
            const elevenOhFive = Date.parse('2026-09-30T11:05:00.000Z');
            // Ten correct easy answers from 11:05Z (00:05 NZDT on 1 October): 10 XP against goal 10.
            const nextDay = Array.from({ length: 10 }, (_, index) =>
                buildEvent(at(elevenOhFive + index * SECOND_MS), {
                    questionId: EASY_QUESTION_IDS[index % EASY_QUESTION_IDS.length],
                }),
            );
            // 10:59Z is 23:59 NZDT on 30 September: one correct answer and one wrong one.
            const sameDayCorrect = buildEvent('2026-09-30T10:59:00.000Z', {
                questionId: EASY_QUESTION_IDS[0],
            });
            const sameDayWrong = buildEvent('2026-09-30T10:30:00.000Z', {
                choiceIndex: EASY_WRONG_INDEX,
                questionId: EASY_QUESTION_IDS[4],
            });

            const response = await request(app)
                .post(ROUTE)
                .set('Authorization', authorization)
                .send({ events: [...nextDay, sameDayCorrect, sameDayWrong] });

            expect(response.status).toBe(HTTP_OK);
            expect(toLocalDate(nextDay[0].answeredAt, AUCKLAND)).toBe('2026-10-01');
            const stored = await readStoredEvents(userId);
            const goals: GoalChange[] = [{ from: '2026-09-01', goal: 10 }];
            const dueIds = findDueReviewEventIds(stored);
            const expected = computeDailyProgress(stored, AUCKLAND, goals, (event) => dueIds.has(event.eventId));
            const rows = await readProgress(userId);
            expect(rows).toEqual(
                expected.map((day) => ({
                    is_goal_met: day.isGoalMet,
                    local_date: day.localDate,
                    xp: day.xp,
                })),
            );
            expect(rows).toEqual([
                { is_goal_met: false, local_date: '2026-09-30', xp: 1 },
                { is_goal_met: true, local_date: '2026-10-01', xp: 10 },
            ]);
            expect(response.body.data.xpTotal).toBe(11);
        });
    });

    describe('review bonus', () => {
        const MEDIUM_XP = XP_BY_DIFFICULTY.medium;

        async function uploadFor(
            authorization: string,
            app: ReturnType<typeof createSyncTestApp>['app'],
            events: WireEvent[],
        ): Promise<request.Response> {
            return request(app).post(ROUTE).set('Authorization', authorization).send({ events });
        }

        it('earns no bonus for the first correct answer to a question, even in a review round', async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const first = buildEvent(at(now().getTime() - DAY_MS), {
                bankKey: MEDIUM_BANK,
                choiceIndex: MEDIUM_ANSWER_INDEX,
                questionId: MEDIUM_QUESTION_ID,
                roundKind: 'review',
            });

            const response = await uploadFor(authorization, app, [first]);

            expect(response.status).toBe(HTTP_OK);
            expect(findDueReviewEventIds(await readStoredEvents(userId)).has(first.eventId)).toBe(false);
            expect(response.body.data.xpTotal).toBe(MEDIUM_XP);
            expect(await storedXpTotal(userId)).toBe(MEDIUM_XP);
        });

        it('adds REVIEW_BONUS_XP to a correct review-round answer once the missed question is due, uploaded in a later batch', async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const miss = buildEvent(at(now().getTime() - 10 * DAY_MS), {
                bankKey: MEDIUM_BANK,
                choiceIndex: MEDIUM_WRONG_INDEX,
                questionId: MEDIUM_QUESTION_ID,
            });
            const review = buildEvent(at(now().getTime() - 3 * DAY_MS), {
                bankKey: MEDIUM_BANK,
                choiceIndex: MEDIUM_ANSWER_INDEX,
                questionId: MEDIUM_QUESTION_ID,
                roundKind: 'review',
            });

            const missResponse = await uploadFor(authorization, app, [miss]);
            const reviewResponse = await uploadFor(authorization, app, [review]);

            expect(missResponse.status).toBe(HTTP_OK);
            expect(missResponse.body.data.xpTotal).toBe(0);
            expect(reviewResponse.status).toBe(HTTP_OK);
            expect(findDueReviewEventIds(await readStoredEvents(userId)).has(review.eventId)).toBe(true);
            expect(reviewResponse.body.data.xpTotal).toBe(MEDIUM_XP + REVIEW_BONUS_XP);
            expect(await storedXpTotal(userId)).toBe(MEDIUM_XP + REVIEW_BONUS_XP);
        });

        it.each(['bank', 'topic'] as const)(
            'earns no bonus for the same due correct answer in a %s round',
            async (roundKind) => {
                const { app, now } = createSyncTestApp({
                    answerKey,
                    pool: database.pool,
                });
                const { authorization, userId } = await signIn(now());
                const miss = buildEvent(at(now().getTime() - 10 * DAY_MS), {
                    bankKey: MEDIUM_BANK,
                    choiceIndex: MEDIUM_WRONG_INDEX,
                    questionId: MEDIUM_QUESTION_ID,
                });
                const later = buildEvent(at(now().getTime() - 3 * DAY_MS), {
                    bankKey: MEDIUM_BANK,
                    choiceIndex: MEDIUM_ANSWER_INDEX,
                    questionId: MEDIUM_QUESTION_ID,
                    roundKind,
                });

                const response = await uploadFor(authorization, app, [miss, later]);

                expect(response.status).toBe(HTTP_OK);
                expect(findDueReviewEventIds(await readStoredEvents(userId)).has(later.eventId)).toBe(false);
                expect(response.body.data.xpTotal).toBe(MEDIUM_XP);
                expect(await storedXpTotal(userId)).toBe(MEDIUM_XP);
            },
        );
    });

    describe('concurrent uploads', () => {
        it('stores each event of two concurrent overlapping batches once, with insertedCounts summing to the distinct events and the package total XP', async () => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const base = now().getTime() - 20 * DAY_MS;
            for (let round = 0; round < CONCURRENT_ROUNDS; round += 1) {
                const { authorization, userId } = await signIn(now());
                // 30 distinct events: misses and correct answers across the easy questions, plus a
                // medium miss and a due review of it, so the total carries a review bonus.
                const distinct: WireEvent[] = [
                    ...Array.from({ length: 28 }, (_, index) =>
                        buildEvent(at(base + index * MINUTE_MS), {
                            choiceIndex: index % 3 === 0 ? EASY_WRONG_INDEX : EASY_ANSWER_INDEX,
                            questionId: EASY_QUESTION_IDS[index % EASY_QUESTION_IDS.length],
                        }),
                    ),
                    buildEvent(at(base), {
                        bankKey: MEDIUM_BANK,
                        choiceIndex: MEDIUM_WRONG_INDEX,
                        questionId: MEDIUM_QUESTION_ID,
                    }),
                    buildEvent(at(base + 5 * DAY_MS), {
                        bankKey: MEDIUM_BANK,
                        choiceIndex: MEDIUM_ANSWER_INDEX,
                        questionId: MEDIUM_QUESTION_ID,
                        roundKind: 'review',
                    }),
                ];
                const shared = distinct.slice(10, 20);
                const firstBatch = [...distinct.slice(0, 10), ...shared];
                const secondBatch = [...shared, ...distinct.slice(20)];

                const [first, second] = await Promise.all([
                    request(app).post(ROUTE).set('Authorization', authorization).send({ events: firstBatch }),
                    request(app).post(ROUTE).set('Authorization', authorization).send({ events: secondBatch }),
                ]);

                expect(first.status).toBe(HTTP_OK);
                expect(second.status).toBe(HTTP_OK);
                expect(first.body.data.insertedCount + second.body.data.insertedCount).toBe(distinct.length);
                const { rows } = await database.pool.query<{
                    copies: string;
                    event_id: string;
                }>('SELECT event_id, COUNT(*) AS copies FROM answer_events WHERE user_id = $1 GROUP BY event_id', [
                    userId,
                ]);
                expect(sorted(rows.map((row) => row.event_id))).toEqual(sorted(distinct.map((event) => event.eventId)));
                expect(rows.every((row) => Number(row.copies) === 1)).toBe(true);
                const stored = await readStoredEvents(userId);
                const dueIds = findDueReviewEventIds(stored);
                expect(dueIds.size).toBeGreaterThan(0);
                const expectedXp = stored.reduce((sum, event) => sum + computeXp(event, dueIds.has(event.eventId)), 0);
                expect(await storedXpTotal(userId)).toBe(expectedXp);
                expect(Math.max(first.body.data.xpTotal, second.body.data.xpTotal)).toBe(expectedXp);
            }
        });
    });

    describe('rejected batches', () => {
        it.each([
            {
                code: 'SYNC_INVALID_EVENTS',
                kind: 'an unknown question',
                offending: (nowMs: number) => buildEvent(at(nowMs - MINUTE_MS), { questionId: 'py-easy-999' }),
            },
            {
                code: 'SYNC_TIMESTAMP_OUT_OF_RANGE',
                kind: 'a timestamp out of range',
                offending: (nowMs: number) => buildEvent(at(nowMs + FUTURE_TOLERANCE_MS + MINUTE_MS)),
            },
        ])('leaves daily_progress unchanged when a batch with $kind is rejected', async ({ code, offending }) => {
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const { authorization, userId } = await signIn(now());
            const nowMs = now().getTime();
            const seeded = [
                buildEvent(at(nowMs - 2 * DAY_MS)),
                buildEvent(at(nowMs - DAY_MS), {
                    questionId: EASY_QUESTION_IDS[1],
                }),
            ];
            const seed = await request(app).post(ROUTE).set('Authorization', authorization).send({ events: seeded });
            expect(seed.status).toBe(HTTP_OK);
            const before = await readProgress(userId);
            expect(before.length).toBeGreaterThan(0);
            const bad = offending(nowMs);
            const newValid = [
                buildEvent(at(nowMs - DAY_MS + MINUTE_MS), {
                    questionId: EASY_QUESTION_IDS[2],
                }),
                buildEvent(at(nowMs - MINUTE_MS), {
                    questionId: EASY_QUESTION_IDS[3],
                }),
            ];

            const response = await request(app)
                .post(ROUTE)
                .set('Authorization', authorization)
                .send({ events: [newValid[0], bad, newValid[1]] });

            expect(response.status).toBe(HTTP_UNPROCESSABLE);
            expect(response.body.error.code).toBe(code);
            expect(response.body.error.eventIds).toEqual([bad.eventId]);
            expect(await countEvents(userId)).toBe(seeded.length);
            expect(await readProgress(userId)).toEqual(before);
        });
    });
});
