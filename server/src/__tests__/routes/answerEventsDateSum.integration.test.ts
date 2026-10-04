// B4 (PR #32 round-2 security review, item 11): POST /v1/answer-events sums the XP of every
// affected local date in one statement, so the number of statements one upload sends to the
// database does not grow with the number of dates it affects. The measurement wraps the pool
// handed to the app and counts every query call (direct pool queries and client queries alike).
// Each question is answered correctly in a bank round, then correctly in a review round on its
// own later local date; that review is not due, since only a miss puts a question into review
// state. One upload then backdates a miss of each question between the two answers, which makes
// every later review due (+1 XP on each review date). An upload that flips 3 review dates and
// one that flips 30 must send the same number of statements, give or take a small constant, and
// both must leave daily_progress equal to the full replay.
import { randomUUID } from 'node:crypto';

import { computeDailyProgress, computeDayStreak, findDueReviewEventIds, toLocalDate } from '@syntactical/progress';
import type { AnswerEvent, DailyProgress, GoalChange } from '@syntactical/progress';
import type pg from 'pg';
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
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 180_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DEFAULT_GOAL = 20;
const CHOICE_COUNT = 4;
const MEDIUM_BANK = 'python/medium';
const MEDIUM_ANSWER_INDEX = 1;
const MEDIUM_WRONG_INDEX = 0;
const FEW_DATES = 3;
const MANY_DATES = 30;
const FIRST_ANSWER_DAYS_AGO = 70;
const MISS_DAYS_AGO = 60;
const STATEMENT_SLACK = 3;
const ZONE = 'Pacific/Auckland';

const QUESTION_IDS = Array.from(
    { length: MANY_DATES },
    (_, index) => `py-medium-${String(index + 1).padStart(3, '0')}`,
);

const answerKey: AnswerKey = new Map([
    [
        MEDIUM_BANK,
        new Map<string, AnswerKeyEntry>(
            QUESTION_IDS.map((id) => [id, { answerIndex: MEDIUM_ANSWER_INDEX, choiceCount: CHOICE_COUNT }] as const),
        ),
    ],
]);

type RoundKind = AnswerEvent['roundKind'];

interface WireEvent {
    answeredAt: string;
    bankKey: string;
    choiceIndex: number;
    eventId: string;
    questionId: string;
    roundKind: RoundKind;
}

interface ProgressRow {
    is_goal_met: boolean;
    local_date: string;
    xp: number;
}

interface Totals {
    dayStreak: number;
    xpToday: number;
    xpTotal: number;
}

interface StatementCounter {
    statements: number;
}

interface Measurement {
    flippedDates: number;
    statements: number;
}

type QueryArguments = Parameters<pg.Pool['query']>;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function countingQuery(target: object, query: (...args: QueryArguments) => unknown, counter: StatementCounter) {
    return async function countedQuery(...args: QueryArguments): Promise<unknown> {
        counter.statements += 1;
        return Reflect.apply(query, target, args);
    };
}

function bindMember(target: object, property: string | symbol): unknown {
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
}

// A pool whose clients and direct queries add one to the counter per statement sent.
function createCountingPool(pool: pg.Pool, counter: StatementCounter): pg.Pool {
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

function buildAnswer(questionId: string, answeredAtMs: number, isCorrect: boolean, roundKind: RoundKind): WireEvent {
    return {
        answeredAt: new Date(answeredAtMs).toISOString(),
        bankKey: MEDIUM_BANK,
        choiceIndex: isCorrect ? MEDIUM_ANSWER_INDEX : MEDIUM_WRONG_INDEX,
        eventId: randomUUID(),
        questionId,
        roundKind,
    };
}

// A user with a session and the given stored timezone, created 30 days before the clock.
async function signIn(now: Date, timezone: string): Promise<{ authorization: string; userId: string }> {
    const { sessionToken, userId } = await insertSession(database.pool, {
        createdAt: now,
    });
    await database.pool.query('UPDATE users SET created_at = $2, timezone = $3 WHERE id = $1', [
        userId,
        new Date(now.getTime() - 30 * DAY_MS),
        timezone,
    ]);
    return { authorization: `Bearer ${sessionToken}`, userId };
}

async function readProgress(userId: string): Promise<ProgressRow[]> {
    const { rows } = await database.pool.query<ProgressRow>(
        `SELECT to_char(local_date, 'YYYY-MM-DD') AS local_date, xp, is_goal_met
         FROM daily_progress WHERE user_id = $1 ORDER BY local_date`,
        [userId],
    );
    return rows;
}

async function readStoredEvents(userId: string): Promise<AnswerEvent[]> {
    const { rows } = await database.pool.query<{
        answered_at: Date;
        bank_key: string;
        choice_index: number;
        event_id: string;
        is_correct: boolean;
        question_id: string;
        round_kind: RoundKind;
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

// The goal history the server applies: goal 20 from the earliest event's local date (or today)
// until the first recorded change, when no change starts on or before that date.
function buildGoalHistory(
    changes: readonly GoalChange[],
    events: readonly AnswerEvent[],
    timezone: string,
    today: string,
): GoalChange[] {
    const [fallbackFrom] = [today, ...events.map((event) => toLocalDate(event.answeredAt, timezone))].sort();
    const isBaselineMissing = changes.every((change) => change.from > fallbackFrom);
    return isBaselineMissing ? [{ from: fallbackFrom, goal: DEFAULT_GOAL }, ...changes] : [...changes];
}

function computeExpected(
    events: readonly AnswerEvent[],
    timezone: string,
    changes: readonly GoalChange[],
    today: string,
): { rows: ProgressRow[]; totals: Totals } {
    const dueIds = findDueReviewEventIds(events);
    const progress: DailyProgress[] = computeDailyProgress(
        events,
        timezone,
        buildGoalHistory(changes, events, timezone, today),
        (event) => dueIds.has(event.eventId),
    );
    return {
        rows: progress.map(({ isGoalMet, localDate, xp }) => ({
            is_goal_met: isGoalMet,
            local_date: localDate,
            xp,
        })),
        totals: {
            dayStreak: computeDayStreak(progress, today),
            xpToday: progress.find((day) => day.localDate === today)?.xp ?? 0,
            xpTotal: progress.reduce((sum, day) => sum + day.xp, 0),
        },
    };
}

function pickTotals(data: Totals): Totals {
    const { dayStreak, xpToday, xpTotal } = data;
    return { dayStreak, xpToday, xpTotal };
}

function countFlippedDates(before: readonly ProgressRow[], after: readonly ProgressRow[]): number {
    const xpBefore = new Map(before.map((row) => [row.local_date, row.xp] as const));
    return after.filter((row) => xpBefore.has(row.local_date) && xpBefore.get(row.local_date) !== row.xp).length;
}

// Stores, for the first `dateCount` questions, a correct bank answer and a later correct review
// on that question's own date (a different local date per question), then uploads a backdated
// miss of each question between the two and counts the statements that upload sends.
async function measureBackdatedMisses(dateCount: number): Promise<Measurement> {
    const counter: StatementCounter = { statements: 0 };
    const { app, now } = createSyncTestApp({
        answerKey,
        pool: createCountingPool(database.pool, counter),
    });
    const nowMs = now().getTime();
    const { authorization, userId } = await signIn(now(), ZONE);
    const questionIds = QUESTION_IDS.slice(0, dateCount);
    const firstAnswers = questionIds.map((questionId, index) =>
        buildAnswer(questionId, nowMs - FIRST_ANSWER_DAYS_AGO * DAY_MS + index * HOUR_MS, true, 'bank'),
    );
    const reviews = questionIds.map((questionId, index) =>
        buildAnswer(questionId, nowMs - (index + 2) * DAY_MS - 3 * HOUR_MS, true, 'review'),
    );
    const misses = questionIds.map((questionId, index) =>
        buildAnswer(questionId, nowMs - MISS_DAYS_AGO * DAY_MS + index * HOUR_MS, false, 'bank'),
    );
    const reviewDates = new Set(reviews.map((review) => toLocalDate(review.answeredAt, ZONE)));
    expect(reviewDates.size).toBe(dateCount);

    const history = await request(app)
        .post(ROUTE)
        .set('Authorization', authorization)
        .send({ events: [...firstAnswers, ...reviews] });
    const rowsBefore = await readProgress(userId);
    counter.statements = 0;
    const response = await request(app).post(ROUTE).set('Authorization', authorization).send({ events: misses });
    const statements = counter.statements;
    const rowsAfter = await readProgress(userId);

    expect(history.status).toBe(HTTP_OK);
    expect(response.status).toBe(HTTP_OK);
    expect(response.body.data.insertedCount).toBe(dateCount);
    const stored = await readStoredEvents(userId);
    const dueIds = findDueReviewEventIds(stored);
    expect(reviews.every((review) => dueIds.has(review.eventId))).toBe(true);
    const today = toLocalDate(now().toISOString(), ZONE);
    const expected = computeExpected(stored, ZONE, [], today);
    expect(rowsAfter).toEqual(expected.rows);
    expect(pickTotals(response.body.data as Totals)).toEqual(expected.totals);
    return { flippedDates: countFlippedDates(rowsBefore, rowsAfter), statements };
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/answer-events sums the affected dates in one statement', () => {
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
        'sends no more statements for a backdated upload that flips 30 later review dates than for one that flips 3, and both equal the full replay',
        async () => {
            const few = await measureBackdatedMisses(FEW_DATES);
            const many = await measureBackdatedMisses(MANY_DATES);

            expect(few.flippedDates).toBe(FEW_DATES);
            expect(many.flippedDates).toBe(MANY_DATES);
            expect(many.statements).toBeLessThanOrEqual(few.statements + STATEMENT_SLACK);
        },
        TEST_TIMEOUT_MS,
    );
});
