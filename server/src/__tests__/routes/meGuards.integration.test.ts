// Guards on /v1/me from the PR #32 review: the per-user PATCH rate limit fed its insecure value
// (the request past the limit).
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { SYNC } from '../../constants/sync.js';
import { rateLimitKey } from '../../services/rateLimitKey.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ME_ROUTE = '/v1/me';
const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const SETUP_TIMEOUT_MS = 120_000;

const answerKey: AnswerKey = new Map([
    ['python/easy', new Map<string, AnswerKeyEntry>([['py-easy-001', { answerIndex: 1, choiceCount: 4 }]])],
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function windowStartOf(now: Date): Date {
    const { WINDOW_MS } = SYNC.RATE_LIMIT;
    return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
}

describe.skipIf(SKIP_DATABASE_TESTS)('/v1/me guards', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('allows the 60th PATCH in an hour and refuses the 61st with 429, leaving the profile unchanged', async () => {
        const { app, now, rateLimitKeySecret } = createSyncTestApp({ answerKey, pool: database.pool });
        const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
        const authorization = `Bearer ${sessionToken}`;
        const limit = SYNC.RATE_LIMIT.PROFILE_UPDATE_PER_USER;
        await database.pool.query('INSERT INTO rate_limit_counters (key, window_start, count) VALUES ($1, $2, $3)', [
            rateLimitKey(rateLimitKeySecret, SYNC.RATE_LIMIT_SCOPE.PROFILE_UPDATE, userId),
            windowStartOf(now()),
            limit - 1,
        ]);

        const atLimit = await request(app).patch(ME_ROUTE).set('Authorization', authorization).send({ dailyGoal: 10 });
        const pastLimit = await request(app)
            .patch(ME_ROUTE)
            .set('Authorization', authorization)
            .send({ dailyGoal: 50, timezone: 'Pacific/Auckland' });
        const profile = await request(app).get(ME_ROUTE).set('Authorization', authorization);

        expect(limit).toBe(60);
        expect(atLimit.status).toBe(HTTP_OK);
        expect(pastLimit.status).toBe(HTTP_TOO_MANY_REQUESTS);
        expect(pastLimit.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(profile.status).toBe(HTTP_OK);
        expect(profile.body.data).toMatchObject({ dailyGoal: 10, timezone: null });
    });
});
