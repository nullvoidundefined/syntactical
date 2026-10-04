// B3 (PR #32 round-2 security review, item 10): when the zone the daily_progress rows were built
// in no longer matches the user's zone, POST /v1/answer-events brings the rows up to date even
// when the batch inserts nothing (every id already stored). A null-zone user's rows are built in
// UTC dates; a real sign-in from a device in Pacific/Auckland sets the zone without rebuilding;
// a re-upload of only already-stored ids must still leave rows and response totals equal to the
// full replay in Auckland, so no UTC-dated row survives.
import { randomUUID } from 'node:crypto';

import { computeDailyProgress, computeDayStreak, findDueReviewEventIds, toLocalDate } from '@syntactical/progress';
import type { AnswerEvent, DailyProgress, GoalChange } from '@syntactical/progress';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/answer-events';
const CODES_ROUTE = '/v1/auth/codes';
const SESSIONS_ROUTE = '/v1/auth/sessions';
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 120_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DEFAULT_GOAL = 20;
const CHOICE_COUNT = 4;
const AUCKLAND = 'Pacific/Auckland';
const UTC = 'UTC';
const CLIENT_IP = '192.0.2.41';

const BANKS = {
    easy: { answerIndex: 2, bankKey: 'python/easy', questionIds: ['py-easy-001', 'py-easy-002'] },
    hard: { answerIndex: 3, bankKey: 'python/hard', questionIds: ['py-hard-001', 'py-hard-002'] },
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

// A user with a session and no stored timezone, created 30 days before the clock.
async function signInWithoutZone(now: Date): Promise<{ authorization: string; userId: string }> {
    const { sessionToken, userId } = await insertSession(database.pool, {
        createdAt: now,
    });
    await database.pool.query('UPDATE users SET created_at = $2, timezone = NULL WHERE id = $1', [
        userId,
        new Date(now.getTime() - 30 * DAY_MS),
    ]);
    return { authorization: `Bearer ${sessionToken}`, userId };
}

// A real sign-in by the same user's email from a device that reports the given zone: the
// server stores that zone only when the user had none, and rebuilds nothing.
async function signInThroughAuth(userId: string, timezone: string): Promise<void> {
    const { rows } = await database.pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
    const [{ email }] = rows;
    const { app, sentCodes } = createAuthTestApp({ pool: database.pool });
    await request(app).post(CODES_ROUTE).set('X-Forwarded-For', CLIENT_IP).send({ email });
    const { code } = sentCodes[sentCodes.length - 1];
    const response = await request(app)
        .post(SESSIONS_ROUTE)
        .set('X-Forwarded-For', CLIENT_IP)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ code, email, timezone });
    expect(response.status).toBe(HTTP_CREATED);
}

async function readTimezone(userId: string): Promise<string | null> {
    const { rows } = await database.pool.query<{ timezone: string | null }>(
        'SELECT timezone FROM users WHERE id = $1',
        [userId],
    );
    return rows[0]?.timezone ?? null;
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

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/answer-events refreshes progress on a zone mismatch when nothing is inserted', () => {
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
        'rebuilds UTC-dated rows in Pacific/Auckland when a re-upload of already-stored ids follows the sign-in that set the zone',
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const nowMs = now().getTime();
            const utcMidnightMs = Math.floor(nowMs / DAY_MS) * DAY_MS;
            const { authorization, userId } = await signInWithoutZone(now());
            // 20:00 to 22:00 UTC is the next calendar day in Auckland (UTC+12 or +13).
            const first = buildAnswer(
                BANKS.easy,
                BANKS.easy.questionIds[0],
                utcMidnightMs - 3 * DAY_MS + 20 * HOUR_MS,
                true,
                'bank',
            );
            const second = buildAnswer(
                BANKS.hard,
                BANKS.hard.questionIds[0],
                utcMidnightMs - 2 * DAY_MS + 21 * HOUR_MS,
                true,
                'bank',
            );
            const third = buildAnswer(
                BANKS.hard,
                BANKS.hard.questionIds[1],
                utcMidnightMs - DAY_MS + 22 * HOUR_MS,
                true,
                'bank',
            );
            expect(toLocalDate(first.answeredAt, UTC)).not.toBe(toLocalDate(first.answeredAt, AUCKLAND));

            const before = await upload(app, authorization, [first, second, third]);
            const utcDates = (await readProgress(userId)).map((row) => row.local_date);
            await signInThroughAuth(userId, AUCKLAND);
            const again = await upload(app, authorization, [first, second]);

            expect(before.status).toBe(HTTP_OK);
            expect(before.body.data.insertedCount).toBe(3);
            expect(utcDates).toContain(toLocalDate(first.answeredAt, UTC));
            expect(await readTimezone(userId)).toBe(AUCKLAND);
            expect(again.status).toBe(HTTP_OK);
            expect(again.body.data.insertedCount).toBe(0);
            const today = toLocalDate(now().toISOString(), AUCKLAND);
            const expected = computeExpected(await readStoredEvents(userId), AUCKLAND, [], today);
            const rows = await readProgress(userId);
            expect(rows.map((row) => row.local_date)).not.toContain(toLocalDate(first.answeredAt, UTC));
            expect(rows).toEqual(expected.rows);
            expect(pickTotals(again.body.data as Totals)).toEqual(expected.totals);
        },
        TEST_TIMEOUT_MS,
    );
});
