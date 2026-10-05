// Task 3.8 (B-35, timezone storage): GET /v1/me returns the profile with progress computed from
// stored data; PATCH /v1/me changes the timezone (a known IANA zone only) and the daily goal
// (10, 20, or 50 only), a goal change applying from today in the user's timezone on. Task 7.6
// (B-82): the profile carries hasPassword, true exactly when a password hash is stored, and never
// the hash itself.
import { randomBytes, randomUUID } from 'node:crypto';

import { toLocalDate } from '@syntactical/progress';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { hashPassword } from '../../services/passwordHash.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ME_ROUTE = '/v1/me';
const EVENTS_ROUTE = '/v1/answer-events';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const SETUP_TIMEOUT_MS = 120_000;
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const EASY_BANK = 'python/easy';
const QUESTION_COUNT = 40;
const QUESTION_IDS = Array.from({ length: QUESTION_COUNT }, (_unused, index) => `py-easy-${index}`);
const ANSWER_INDEX = 1;
const AUCKLAND = 'Pacific/Auckland';
const PASSWORD_BYTES = 12;

const answerKey: AnswerKey = new Map([
    [
        EASY_BANK,
        new Map<string, AnswerKeyEntry>(QUESTION_IDS.map((id) => [id, { answerIndex: ANSWER_INDEX, choiceCount: 4 }])),
    ],
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

interface SignedIn {
    app: ReturnType<typeof createSyncTestApp>['app'];
    now: () => Date;
    sessionToken: string;
    userId: string;
}

async function signIn(timezone: string | null): Promise<SignedIn> {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
    await database.pool.query('UPDATE users SET timezone = $2, created_at = $3 WHERE id = $1', [
        userId,
        timezone,
        new Date(now().getTime() - 30 * DAY_MS),
    ]);
    return { app, now, sessionToken, userId };
}

function bearer({ sessionToken }: SignedIn): string {
    return `Bearer ${sessionToken}`;
}

// Correct easy answers, 1 XP each, one distinct question per instant.
async function uploadCorrect(signedIn: SignedIn, instants: Date[]): Promise<void> {
    const events = instants.map((at, index) => ({
        answeredAt: at.toISOString(),
        bankKey: EASY_BANK,
        choiceIndex: ANSWER_INDEX,
        eventId: randomUUID(),
        questionId: QUESTION_IDS[index % QUESTION_COUNT],
        roundKind: 'bank',
    }));
    const response = await request(signedIn.app)
        .post(EVENTS_ROUTE)
        .set('Authorization', bearer(signedIn))
        .send({ events });
    expect(response.status).toBe(HTTP_OK);
}

// `count` instants a second apart, ending one second before `end`.
function secondsBefore(end: Date, count: number): Date[] {
    return Array.from({ length: count }, (_unused, index) => new Date(end.getTime() - (index + 1) * SECOND_MS));
}

function getMe(signedIn: SignedIn) {
    return request(signedIn.app).get(ME_ROUTE).set('Authorization', bearer(signedIn));
}

function patchMe(signedIn: SignedIn, body: object) {
    return request(signedIn.app).patch(ME_ROUTE).set('Authorization', bearer(signedIn)).send(body);
}

async function storedProgress(userId: string): Promise<Map<string, { isGoalMet: boolean; xp: number }>> {
    const { rows } = await database.pool.query<{ is_goal_met: boolean; local_date: string; xp: number }>(
        "SELECT to_char(local_date, 'YYYY-MM-DD') AS local_date, xp, is_goal_met FROM daily_progress WHERE user_id = $1",
        [userId],
    );
    return new Map(rows.map((row) => [row.local_date, { isGoalMet: row.is_goal_met, xp: row.xp }]));
}

describe.skipIf(SKIP_DATABASE_TESTS)('/v1/me', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('GET returns the email, timezone, goal, day streak, XP, and granted entitlements from stored data', async () => {
        const signedIn = await signIn('UTC');
        const { now, userId } = signedIn;
        const today = toLocalDate(now().toISOString(), 'UTC');
        const todayStart = new Date(`${today}T00:00:00Z`);
        // 20 XP yesterday (goal met) and up to 5 XP today (not met): the streak counts through yesterday.
        const todays = secondsBefore(new Date(Math.min(now().getTime(), todayStart.getTime() + 10 * SECOND_MS)), 5);
        await uploadCorrect(signedIn, [
            ...secondsBefore(new Date(todayStart.getTime() - MINUTE_MS), 20),
            ...todays.filter((at) => at >= todayStart),
        ]);
        await database.pool.query(
            `INSERT INTO entitlements (user_id, product_id, source, status) VALUES
             ($1, 'syntactical.python.medium', 'test', 'granted'),
             ($1, 'syntactical.python.hard', 'test', 'revoked')`,
            [userId],
        );
        const { rows } = await database.pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
        const xpToday = (await storedProgress(userId)).get(today)?.xp ?? 0;

        const response = await getMe(signedIn);

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({
            data: {
                dailyGoal: 20,
                dayStreak: 1,
                email: rows[0].email,
                entitlements: ['syntactical.python.medium'],
                hasPassword: false,
                timezone: 'UTC',
                xpToday,
                xpTotal: 20 + xpToday,
            },
        });
    });

    it('GET reports a null timezone, goal 20, and no progress for a new user', async () => {
        const signedIn = await signIn(null);

        const response = await getMe(signedIn);

        expect(response.status).toBe(HTTP_OK);
        expect(response.body.data).toMatchObject({
            dailyGoal: 20,
            dayStreak: 0,
            entitlements: [],
            hasPassword: false,
            timezone: null,
            xpToday: 0,
            xpTotal: 0,
        });
    });

    it('GET and PATCH report hasPassword true exactly when a hash is stored, and no body carries the hash', async () => {
        const signedIn = await signIn('UTC');
        const storedHash = await hashPassword(randomBytes(PASSWORD_BYTES).toString('hex'));

        const before = await getMe(signedIn);
        await database.pool.query('UPDATE users SET password_hash = $2, password_updated_at = now() WHERE id = $1', [
            signedIn.userId,
            storedHash,
        ]);
        const after = await getMe(signedIn);
        const patched = await patchMe(signedIn, { dailyGoal: 10 });

        expect(before.status).toBe(HTTP_OK);
        expect(before.body.data.hasPassword).toBe(false);
        expect(after.status).toBe(HTTP_OK);
        expect(after.body.data.hasPassword).toBe(true);
        expect(patched.status).toBe(HTTP_OK);
        expect(patched.body.data.hasPassword).toBe(true);
        for (const response of [before, after, patched]) {
            expect(response.text).not.toContain('$scrypt$');
            expect(response.text).not.toContain(storedHash);
        }
    });

    it('answers GET and PATCH with 401 without a session', async () => {
        const { app } = createSyncTestApp({ answerKey, pool: database.pool });

        expect((await request(app).get(ME_ROUTE)).status).toBe(HTTP_UNAUTHORIZED);
        expect((await request(app).patch(ME_ROUTE).send({ dailyGoal: 10 })).status).toBe(HTTP_UNAUTHORIZED);
    });

    it('PATCH stores a known IANA timezone and refuses anything else with 400', async () => {
        const signedIn = await signIn('UTC');

        const accepted = await patchMe(signedIn, { timezone: AUCKLAND });
        expect(accepted.status).toBe(HTTP_OK);
        expect(accepted.body.data.timezone).toBe(AUCKLAND);

        for (const timezone of ['Mars/Olympus_Mons', '', 'UTC; DROP TABLE users', 'x'.repeat(100), 42, null]) {
            const refused = await patchMe(signedIn, { timezone });
            expect(refused.status).toBe(HTTP_BAD_REQUEST);
            expect(refused.body.error.code).toBe('INPUT_INVALID_BODY');
        }
        const { rows } = await database.pool.query<{ timezone: string }>('SELECT timezone FROM users WHERE id = $1', [
            signedIn.userId,
        ]);
        expect(rows[0].timezone).toBe(AUCKLAND);
    });

    it('PATCH accepts a daily goal of 10, 20, or 50 and refuses any other goal, field, or empty body', async () => {
        const signedIn = await signIn('UTC');

        for (const dailyGoal of [10, 20, 50]) {
            const accepted = await patchMe(signedIn, { dailyGoal });
            expect(accepted.status).toBe(HTTP_OK);
            expect(accepted.body.data.dailyGoal).toBe(dailyGoal);
        }
        for (const body of [{ dailyGoal: 15 }, { dailyGoal: 0 }, { dailyGoal: '20' }, {}, { email: 'b@example.com' }]) {
            expect((await patchMe(signedIn, body)).status).toBe(HTTP_BAD_REQUEST);
        }
        expect((await getMe(signedIn)).body.data.dailyGoal).toBe(50);
    });

    it('a goal change records today in the user timezone and applies from today on, not to earlier days', async () => {
        const signedIn = await signIn(AUCKLAND);
        const { now, userId } = signedIn;
        const today = toLocalDate(now().toISOString(), AUCKLAND);
        const dayAgo = new Date(now().getTime() - DAY_MS);
        const yesterday = toLocalDate(dayAgo.toISOString(), AUCKLAND);
        // 12 XP a day ago and 12 XP in the last seconds: under goal 20 neither day is met.
        await uploadCorrect(signedIn, [...secondsBefore(dayAgo, 12), ...secondsBefore(now(), 12)]);
        const before = await storedProgress(userId);
        expect(before.get(yesterday)?.isGoalMet).toBe(false);

        const response = await patchMe(signedIn, { dailyGoal: 10 });

        expect(response.status).toBe(HTTP_OK);
        const { rows } = await database.pool.query<{ from_date: string; goal: number }>(
            "SELECT to_char(from_date, 'YYYY-MM-DD') AS from_date, goal FROM daily_goal_changes WHERE user_id = $1",
            [userId],
        );
        expect(rows).toEqual([{ from_date: today, goal: 10 }]);
        const after = await storedProgress(userId);
        expect(after.get(yesterday)).toEqual({ isGoalMet: false, xp: before.get(yesterday)?.xp });
        expect(after.get(today)?.isGoalMet).toBe((after.get(today)?.xp ?? 0) >= 10);
        expect(response.body.data.dailyGoal).toBe(10);
    });

    it('a timezone change re-buckets stored progress into the new local dates', async () => {
        const signedIn = await signIn('UTC');
        const { now, userId } = signedIn;
        const instant = new Date(now().getTime() - 2 * DAY_MS);
        await uploadCorrect(signedIn, [instant]);

        await patchMe(signedIn, { timezone: AUCKLAND });

        const progress = await storedProgress(userId);
        expect([...progress.keys()]).toEqual([toLocalDate(instant.toISOString(), AUCKLAND)]);
    });

    it('refuses a cookie PATCH without X-Requested-With through the CSRF guard', async () => {
        const signedIn = await signIn('UTC');

        const response = await request(signedIn.app)
            .patch(ME_ROUTE)
            .set('Cookie', `syntactical_session=${signedIn.sessionToken}`)
            .send({ dailyGoal: 10 });

        expect(response.status).toBe(HTTP_FORBIDDEN);
        expect((await getMe(signedIn)).body.data.dailyGoal).toBe(20);
    });
});
