// R3 guards (owner decision 2026-10-03, PR #32): a full replay through PATCH /v1/me between two
// uploads leaves the stored daily_progress rows and every event's stored xp equal to the full
// replay of the stored events (computeDailyProgress and computeXp with findDueReviewEventIds,
// the user's timezone, and the goal history the server applies), when the later upload lands
// on the same dates and backdates a miss before a later review of the same question. These
// pass today and guard the path that chooses between the incremental update and the replay.
import { randomUUID } from 'node:crypto';

import {
    computeDailyProgress,
    computeDayStreak,
    computeXp,
    findDueReviewEventIds,
    toLocalDate,
} from '@syntactical/progress';
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
const ME_ROUTE = '/v1/me';
const HTTP_OK = 200;
const SETUP_TIMEOUT_MS = 120_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_GOAL = 20;
const CHANGED_GOAL = 10;
const CHOICE_COUNT = 4;
const AUCKLAND = 'Pacific/Auckland';

const BANKS = {
    easy: { answerIndex: 2, bankKey: 'python/easy', questionIds: ['py-easy-001', 'py-easy-002'] },
    hard: { answerIndex: 3, bankKey: 'python/hard', questionIds: ['py-hard-001', 'py-hard-002', 'py-hard-003'] },
    medium: { answerIndex: 1, bankKey: 'python/medium', questionIds: ['py-medium-001', 'py-medium-002'] },
} as const;

type Bank = (typeof BANKS)[keyof typeof BANKS];

const answerKey: AnswerKey = new Map(
    Object.values(BANKS).map(({ answerIndex, bankKey, questionIds }) => [
        bankKey,
        new Map<string, AnswerKeyEntry>(
            questionIds.map((id) => [id, { answerIndex, choiceCount: CHOICE_COUNT }] as const),
        ),
    ]),
);

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

type App = ReturnType<typeof createSyncTestApp>['app'];

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function buildAnswer(
    bank: Bank,
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

// A user with a session and the given stored timezone, created 30 days before the clock.
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

async function readStoredXp(userId: string): Promise<Record<string, number>> {
    const { rows } = await database.pool.query<{ event_id: string; xp: number }>(
        'SELECT event_id, xp FROM answer_events WHERE user_id = $1',
        [userId],
    );
    return Object.fromEntries(rows.map(({ event_id, xp }) => [event_id, xp]));
}

async function readGoalChanges(userId: string): Promise<GoalChange[]> {
    const { rows } = await database.pool.query<{ from_date: string; goal: number }>(
        `SELECT to_char(from_date, 'YYYY-MM-DD') AS from_date, goal FROM daily_goal_changes
         WHERE user_id = $1 ORDER BY from_date`,
        [userId],
    );
    return rows.map(({ from_date, goal }) => ({ from: from_date, goal }));
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

function computeExpectedXp(events: readonly AnswerEvent[]): Record<string, number> {
    const dueIds = findDueReviewEventIds(events);
    return Object.fromEntries(events.map((event) => [event.eventId, computeXp(event, dueIds.has(event.eventId))]));
}

async function upload(app: App, authorization: string, events: WireEvent[]): Promise<request.Response> {
    return request(app).post(ROUTE).set('Authorization', authorization).send({ events });
}

function pickTotals(data: Totals): Totals {
    const { dayStreak, xpToday, xpTotal } = data;
    return { dayStreak, xpToday, xpTotal };
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/answer-events after a PATCH /v1/me full replay', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('keeps rows and every stored event xp equal to the full replay across an upload, a goal change, and an upload on the same dates', async () => {
        const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
        const nowMs = now().getTime();
        const today = toLocalDate(now().toISOString(), AUCKLAND);
        const { authorization, userId } = await signIn(now(), AUCKLAND);
        const [reviewed, secondHard, thirdHard] = BANKS.hard.questionIds;
        const [firstMedium, secondMedium] = BANKS.medium.questionIds;
        const firstBatch = [
            buildAnswer(BANKS.hard, reviewed, nowMs - 12 * DAY_MS, true, 'bank'),
            buildAnswer(BANKS.hard, reviewed, nowMs - 3 * DAY_MS, true, 'review'),
            buildAnswer(BANKS.hard, secondHard, nowMs - 30 * MINUTE_MS, true, 'bank'),
            buildAnswer(BANKS.hard, thirdHard, nowMs - 25 * MINUTE_MS, true, 'bank'),
            buildAnswer(BANKS.medium, firstMedium, nowMs - 20 * MINUTE_MS, true, 'bank'),
        ];
        const secondBatch = [
            buildAnswer(BANKS.hard, reviewed, nowMs - 6 * DAY_MS, false, 'bank'),
            buildAnswer(BANKS.easy, BANKS.easy.questionIds[0], nowMs - 3 * DAY_MS + MINUTE_MS, true, 'bank'),
            buildAnswer(BANKS.medium, secondMedium, nowMs - 10 * MINUTE_MS, true, 'bank'),
        ];

        const first = await upload(app, authorization, firstBatch);
        const patched = await request(app)
            .patch(ME_ROUTE)
            .set('Authorization', authorization)
            .send({ dailyGoal: CHANGED_GOAL });
        const second = await upload(app, authorization, secondBatch);

        expect(first.status).toBe(HTTP_OK);
        expect(patched.status).toBe(HTTP_OK);
        expect(second.status).toBe(HTTP_OK);
        const stored = await readStoredEvents(userId);
        const changes = await readGoalChanges(userId);
        expect(changes).toEqual([{ from: today, goal: CHANGED_GOAL }]);
        const expected = computeExpected(stored, AUCKLAND, changes, today);
        expect(await readProgress(userId)).toEqual(expected.rows);
        expect(await readStoredXp(userId)).toEqual(computeExpectedXp(stored));
        expect(pickTotals(second.body.data as Totals)).toEqual(expected.totals);
    });
});
