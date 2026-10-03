// Guard tests for R2 (owner decision 2026-10-03, PR #32): however POST /v1/answer-events
// recomputes daily progress, the stored daily_progress rows and the response totals always
// equal the full replay of the stored events (computeDailyProgress with findDueReviewEventIds,
// the user's timezone, and the goal history the server applies). Seeded pseudo-random histories
// (fixed seeds) cover several questions across easy, medium, and hard banks, misses, due and
// early reviews, bank, topic, and review rounds, non-UTC timezones including the extreme
// offsets Pacific/Kiritimati (+14) and Etc/GMT+12 (-12), a recorded goal change dated inside
// the history, after every event, or before the first event, out-of-order and backdated batches, and duplicate event ids within and across batches; the
// rows are checked after every upload. A backdated event that flips a later due-review decision
// of the same question must update that later date's row. These pass against the full replay
// and guard the incremental path.
import { randomUUID } from 'node:crypto';

import { computeDailyProgress, computeDayStreak, findDueReviewEventIds, toLocalDate } from '@syntactical/progress';
import type { AnswerEvent, DailyProgress, GoalChange } from '@syntactical/progress';
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
const HISTORY_TIMEOUT_MS = 180_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DEFAULT_GOAL = 20;
const CHOICE_COUNT = 4;
const SEEDS = [1, 7, 42, 1337, 20_261_003, 99_991];
const TIMEZONES = ['Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata'];
const KIRITIMATI = 'Pacific/Kiritimati';
const GMT_MINUS_12 = 'Etc/GMT+12';
// Before the earliest generated event (at most 60 days and 600 minutes before the clock).
const BEFORE_HISTORY_DAYS = 75;
const CHANGED_GOALS = [10, 50];
const GAPS_MS = [10 * MINUTE_MS, 3 * HOUR_MS, DAY_MS, 2 * DAY_MS, 5 * DAY_MS, 9 * DAY_MS];
const MAX_BATCH_SIZE = 12;

const BANKS = [
    {
        answerIndex: 2,
        bankKey: 'python/easy',
        questionIds: ['py-easy-001', 'py-easy-002', 'py-easy-003'],
    },
    {
        answerIndex: 1,
        bankKey: 'python/medium',
        questionIds: ['py-medium-001', 'py-medium-002'],
    },
    {
        answerIndex: 3,
        bankKey: 'python/hard',
        questionIds: ['py-hard-001', 'py-hard-002'],
    },
] as const;
const [, MEDIUM, HARD] = BANKS;

const answerKey: AnswerKey = new Map(
    BANKS.map(({ answerIndex, bankKey, questionIds }) => [
        bankKey,
        new Map<string, AnswerKeyEntry>(
            questionIds.map((id) => [id, { answerIndex, choiceCount: CHOICE_COUNT }] as const),
        ),
    ]),
);

type RoundKind = AnswerEvent['roundKind'];

// Where the recorded goal change falls: inside the history, on the local day after the clock
// (after every event), or before the first event.
type GoalPlacement = 'after' | 'before' | 'within';

interface HistoryCase {
    placement: GoalPlacement;
    seed: number;
    timezone: string;
}

const HISTORY_CASES: HistoryCase[] = [
    ...SEEDS.map((seed) => ({ placement: 'within' as const, seed, timezone: TIMEZONES[seed % TIMEZONES.length] })),
    { placement: 'within', seed: 5, timezone: KIRITIMATI },
    { placement: 'within', seed: 11, timezone: GMT_MINUS_12 },
    { placement: 'after', seed: 23, timezone: KIRITIMATI },
    { placement: 'before', seed: 31, timezone: GMT_MINUS_12 },
    { placement: 'after', seed: 47, timezone: 'Pacific/Auckland' },
    { placement: 'before', seed: 53, timezone: 'America/Los_Angeles' },
];

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

type App = ReturnType<typeof createSyncTestApp>['app'];

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

// mulberry32: a small seeded PRNG, so every history is reproducible from its seed.
function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return function next(): number {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = state;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
    };
}

function pick<T>(random: () => number, values: readonly T[]): T {
    return values[Math.floor(random() * values.length)];
}

function integerBetween(random: () => number, low: number, high: number): number {
    return low + Math.floor(random() * (high - low + 1));
}

function shuffle<T>(random: () => number, values: readonly T[]): T[] {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
}

function pickRoundKind(random: () => number): RoundKind {
    const roll = random();
    if (roll < 0.6) {
        return 'review';
    }
    return roll < 0.8 ? 'bank' : 'topic';
}

function buildAnswer(
    bank: (typeof BANKS)[number],
    questionId: string,
    answeredAtMs: number,
    isCorrect: boolean,
    roundKind: RoundKind,
): WireEvent {
    const wrongIndex = (bank.answerIndex + 1) % CHOICE_COUNT;
    return {
        answeredAt: new Date(answeredAtMs).toISOString(),
        bankKey: bank.bankKey,
        choiceIndex: isCorrect ? bank.answerIndex : wrongIndex,
        eventId: randomUUID(),
        questionId,
        roundKind,
    };
}

// Each question gets a run of answers days or minutes apart, mostly in review rounds, so some
// reviews land after the item is due and some before; then a block of correct hard answers on
// each of the last few days makes the day streak non-trivial.
function generateHistory(random: () => number, nowMs: number): WireEvent[] {
    const latestMs = nowMs - MINUTE_MS;
    const events: WireEvent[] = [];
    for (const bank of BANKS) {
        for (const questionId of bank.questionIds) {
            let answeredAtMs =
                nowMs - integerBetween(random, 10, 60) * DAY_MS - integerBetween(random, 0, 600) * MINUTE_MS;
            const answerCount = integerBetween(random, 2, 6);
            for (let index = 0; index < answerCount && answeredAtMs <= latestMs; index += 1) {
                const roundKind = index === 0 ? pick(random, ['bank', 'topic'] as const) : pickRoundKind(random);
                events.push(buildAnswer(bank, questionId, answeredAtMs, random() < 0.65, roundKind));
                answeredAtMs += pick(random, GAPS_MS);
            }
        }
    }
    const streakDays = integerBetween(random, 2, 4);
    for (let day = 0; day < streakDays; day += 1) {
        for (let index = 0; index < 4; index += 1) {
            const answeredAtMs = nowMs - day * DAY_MS - (10 + index) * MINUTE_MS;
            events.push(buildAnswer(HARD, pick(random, HARD.questionIds), answeredAtMs, true, 'bank'));
        }
    }
    return events;
}

// Random batch splits of the shuffled history (so later batches backdate earlier ones), with
// some events repeated inside their own batch and some re-sent in a later batch.
function splitIntoBatches(random: () => number, events: readonly WireEvent[]): WireEvent[][] {
    const batches: WireEvent[][] = [];
    const sent: WireEvent[] = [];
    let remaining = shuffle(random, events);
    while (remaining.length > 0) {
        const size = integerBetween(random, 1, MAX_BATCH_SIZE);
        const batch = remaining.slice(0, size);
        remaining = remaining.slice(size);
        if (random() < 0.4) {
            batch.push({ ...pick(random, batch) });
        }
        if (sent.length > 0 && random() < 0.5) {
            batch.push({ ...pick(random, sent) });
        }
        sent.push(...batch);
        batches.push(shuffle(random, batch));
    }
    return batches;
}

async function signIn(now: Date, timezone: string | null): Promise<{ authorization: string; userId: string }> {
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

async function upload(app: App, authorization: string, events: WireEvent[]): Promise<request.Response> {
    return request(app).post(ROUTE).set('Authorization', authorization).send({ events });
}

function pickTotals(data: Totals): Totals {
    const { dayStreak, xpToday, xpTotal } = data;
    return { dayStreak, xpToday, xpTotal };
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/answer-events daily progress equals the full replay', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it.each(HISTORY_CASES)(
        'seed $seed in $timezone, goal change $placement the history: after every upload of a random batch split, daily_progress rows and response totals equal the full replay',
        async ({ placement, seed, timezone }) => {
            const random = createRandom(seed);
            const { app, now } = createSyncTestApp({
                answerKey,
                pool: database.pool,
            });
            const nowMs = now().getTime();
            const today = toLocalDate(now().toISOString(), timezone);
            const { authorization, userId } = await signIn(now(), timezone);
            const withinDaysAgo = integerBetween(random, 5, 25);
            const fromMs = {
                after: nowMs + DAY_MS,
                before: nowMs - BEFORE_HISTORY_DAYS * DAY_MS,
                within: nowMs - withinDaysAgo * DAY_MS,
            }[placement];
            const goalChange: GoalChange = {
                from: toLocalDate(new Date(fromMs).toISOString(), timezone),
                goal: pick(random, CHANGED_GOALS),
            };
            await database.pool.query('INSERT INTO daily_goal_changes (user_id, from_date, goal) VALUES ($1, $2, $3)', [
                userId,
                goalChange.from,
                goalChange.goal,
            ]);
            const history = generateHistory(random, nowMs);
            const historyDates = history.map((event) => toLocalDate(event.answeredAt, timezone)).sort();
            if (placement === 'after') {
                expect(goalChange.from > historyDates[historyDates.length - 1]).toBe(true);
            }
            if (placement === 'before') {
                expect(goalChange.from < historyDates[0]).toBe(true);
            }
            const batches = splitIntoBatches(random, history);

            for (const batch of batches) {
                const response = await upload(app, authorization, batch);

                expect(response.status).toBe(HTTP_OK);
                const expected = computeExpected(await readStoredEvents(userId), timezone, [goalChange], today);
                expect(await readProgress(userId)).toEqual(expected.rows);
                expect(pickTotals(response.body.data as Totals)).toEqual(expected.totals);
            }
            expect(batches.length).toBeGreaterThan(1);
        },
        HISTORY_TIMEOUT_MS,
    );

    it('updates the row of a later due-review date when a backdated miss of the same question makes that review due', async () => {
        const { app, now } = createSyncTestApp({
            answerKey,
            pool: database.pool,
        });
        const nowMs = now().getTime();
        const timezone = 'UTC';
        const today = toLocalDate(now().toISOString(), timezone);
        const { authorization, userId } = await signIn(now(), null);
        const [questionId] = MEDIUM.questionIds;
        const first = buildAnswer(MEDIUM, questionId, nowMs - 12 * DAY_MS, true, 'bank');
        const review = buildAnswer(MEDIUM, questionId, nowMs - 3 * DAY_MS, true, 'review');
        const backdatedMiss = buildAnswer(MEDIUM, questionId, nowMs - 6 * DAY_MS, false, 'bank');
        const reviewDate = toLocalDate(review.answeredAt, timezone);

        const before = await upload(app, authorization, [first, review]);
        const rowsBefore = await readProgress(userId);
        const after = await upload(app, authorization, [backdatedMiss]);
        const rowsAfter = await readProgress(userId);

        expect(before.status).toBe(HTTP_OK);
        expect(after.status).toBe(HTTP_OK);
        const stored = await readStoredEvents(userId);
        expect(
            findDueReviewEventIds(stored.filter((event) => event.eventId !== backdatedMiss.eventId)).has(
                review.eventId,
            ),
        ).toBe(false);
        expect(findDueReviewEventIds(stored).has(review.eventId)).toBe(true);
        expect(rowsBefore.find((row) => row.local_date === reviewDate)?.xp).toBe(2);
        expect(rowsAfter.find((row) => row.local_date === reviewDate)?.xp).toBe(3);
        const expected = computeExpected(stored, timezone, [], today);
        expect(rowsAfter).toEqual(expected.rows);
        expect(pickTotals(after.body.data as Totals)).toEqual(expected.totals);
    });
});
