// R1a (B-32, owner decision 2026-10-03): a user stores at most 100,000 answer events. An upload
// whose new events (those not already stored) would take the user past the cap is refused whole
// with 422 SYNC_EVENT_CAP_REACHED and stores nothing; a re-upload of events already stored still
// succeeds at the cap; another user's history does not count toward this user's cap.
import { randomUUID } from 'node:crypto';

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
const CAP_TEST_TIMEOUT_MS = 120_000;
const EVENT_CAP = 100_000;
const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const BANK_KEY = 'python/easy';
const QUESTION_IDS = ['py-easy-001', 'py-easy-002', 'py-easy-003', 'py-easy-004', 'py-easy-005'];
const CHOICE_COUNT = 4;
const ANSWER_INDEX = 2;

const answerKey: AnswerKey = new Map([
    [
        BANK_KEY,
        new Map<string, AnswerKeyEntry>(
            QUESTION_IDS.map((id) => [id, { answerIndex: ANSWER_INDEX, choiceCount: CHOICE_COUNT }] as const),
        ),
    ],
]);

interface UploadEvent {
    answeredAt: string;
    bankKey: string;
    choiceIndex: number;
    eventId: string;
    questionId: string;
    roundKind: 'bank' | 'review' | 'topic';
}

type App = Parameters<typeof request>[0];

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function signIn(now: Date): Promise<{ authorization: string; userId: string }> {
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now });
    return { authorization: `Bearer ${sessionToken}`, userId };
}

// count stored events for userId, inserted in one statement with fresh event ids, answered a
// second apart going back from answeredFromMs (all within the last few days), against questions
// in the test's answer key.
async function seedStoredEvents(userId: string, count: number, answeredFromMs: number): Promise<void> {
    await database.pool.query(
        `INSERT INTO answer_events
           (user_id, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct)
         SELECT $1, gen_random_uuid(), $3, ($4::text[])[1 + (n % cardinality($4::text[]))], 0,
                to_timestamp(($5::bigint - n * 1000) / 1000.0), 'bank', false
           FROM generate_series(1, $2::int) AS n`,
        [userId, count, BANK_KEY, QUESTION_IDS, answeredFromMs],
    );
}

async function countStoredEvents(userId: string): Promise<number> {
    const { rows } = await database.pool.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM answer_events WHERE user_id = $1',
        [userId],
    );
    return rows[0].count;
}

async function isStored(userId: string, eventId: string): Promise<boolean> {
    const { rows } = await database.pool.query('SELECT 1 FROM answer_events WHERE user_id = $1 AND event_id = $2', [
        userId,
        eventId,
    ]);
    return rows.length > 0;
}

function buildUploadBatch(count: number, startMs: number): UploadEvent[] {
    return Array.from({ length: count }, (_, index) => ({
        answeredAt: new Date(startMs - index * SECOND_MS).toISOString(),
        bankKey: BANK_KEY,
        choiceIndex: index % CHOICE_COUNT,
        eventId: randomUUID(),
        questionId: QUESTION_IDS[index % QUESTION_IDS.length],
        roundKind: 'bank',
    }));
}

function upload(app: App, authorization: string, events: UploadEvent[]) {
    return request(app).post(ROUTE).set('Authorization', authorization).send({ events });
}

describe.skipIf(SKIP_DATABASE_TESTS)('answer event upload per-user cap of 100,000 stored events', () => {
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
        'refuses one new event at exactly 100,000 stored with 422 SYNC_EVENT_CAP_REACHED and stores nothing',
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const { authorization, userId } = await signIn(now());
            await seedStoredEvents(userId, EVENT_CAP, now().getTime() - HOUR_MS);
            const batch = buildUploadBatch(1, now().getTime() - MINUTE_MS);

            const response = await upload(app, authorization, batch);

            expect(response.status).toBe(HTTP_UNPROCESSABLE);
            expect(response.body.error.code).toBe('SYNC_EVENT_CAP_REACHED');
            expect(response.body.data).toBeUndefined();
            expect(await countStoredEvents(userId)).toBe(EVENT_CAP);
            expect(await isStored(userId, batch[0].eventId)).toBe(false);
        },
        CAP_TEST_TIMEOUT_MS,
    );

    it(
        'at 99,999 stored refuses a batch of 2 new events whole, then accepts a batch of 1 up to 100,000',
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const { authorization, userId } = await signIn(now());
            await seedStoredEvents(userId, EVENT_CAP - 1, now().getTime() - HOUR_MS);
            const pair = buildUploadBatch(2, now().getTime() - MINUTE_MS);
            const single = buildUploadBatch(1, now().getTime() - 2 * MINUTE_MS);

            const refused = await upload(app, authorization, pair);

            expect(refused.status).toBe(HTTP_UNPROCESSABLE);
            expect(refused.body.error.code).toBe('SYNC_EVENT_CAP_REACHED');
            expect(refused.body.data).toBeUndefined();
            expect(await countStoredEvents(userId)).toBe(EVENT_CAP - 1);
            expect(await isStored(userId, pair[0].eventId)).toBe(false);
            expect(await isStored(userId, pair[1].eventId)).toBe(false);

            const accepted = await upload(app, authorization, single);

            expect(accepted.status).toBe(HTTP_OK);
            expect(accepted.body.data.insertedCount).toBe(1);
            expect(await countStoredEvents(userId)).toBe(EVENT_CAP);
        },
        CAP_TEST_TIMEOUT_MS,
    );

    it(
        'at the cap accepts a re-upload of already-stored events with insertedCount 0, while a new event is still refused',
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const { authorization, userId } = await signIn(now());
            await seedStoredEvents(userId, EVENT_CAP - 2, now().getTime() - HOUR_MS);
            const lastTwo = buildUploadBatch(2, now().getTime() - MINUTE_MS);
            const filling = await upload(app, authorization, lastTwo);
            expect(filling.status).toBe(HTTP_OK);
            expect(filling.body.data.insertedCount).toBe(2);
            expect(await countStoredEvents(userId)).toBe(EVENT_CAP);

            const retry = await upload(app, authorization, lastTwo);

            expect(retry.status).toBe(HTTP_OK);
            expect(retry.body.data.insertedCount).toBe(0);
            expect(await countStoredEvents(userId)).toBe(EVENT_CAP);

            // A batch mixing a stored event with a new one counts the new one, so it is refused.
            const mixed = [lastTwo[0], ...buildUploadBatch(1, now().getTime() - 2 * MINUTE_MS)];
            const refused = await upload(app, authorization, mixed);

            expect(refused.status).toBe(HTTP_UNPROCESSABLE);
            expect(refused.body.error.code).toBe('SYNC_EVENT_CAP_REACHED');
            expect(await countStoredEvents(userId)).toBe(EVENT_CAP);
            expect(await isStored(userId, mixed[1].eventId)).toBe(false);
        },
        CAP_TEST_TIMEOUT_MS,
    );

    it(
        "does not count another user's stored events toward this user's cap",
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const { authorization, userId } = await signIn(now());
            const other = await signIn(now());
            await seedStoredEvents(other.userId, EVENT_CAP, now().getTime() - HOUR_MS);
            await seedStoredEvents(userId, EVENT_CAP - 1, now().getTime() - HOUR_MS);

            const accepted = await upload(app, authorization, buildUploadBatch(1, now().getTime() - MINUTE_MS));

            expect(accepted.status).toBe(HTTP_OK);
            expect(accepted.body.data.insertedCount).toBe(1);
            expect(await countStoredEvents(userId)).toBe(EVENT_CAP);
            expect(await countStoredEvents(other.userId)).toBe(EVENT_CAP);

            // This user's own count is what reaches the cap: the next new event is refused.
            const refused = await upload(app, authorization, buildUploadBatch(1, now().getTime() - 2 * MINUTE_MS));

            expect(refused.status).toBe(HTTP_UNPROCESSABLE);
            expect(refused.body.error.code).toBe('SYNC_EVENT_CAP_REACHED');
            expect(await countStoredEvents(userId)).toBe(EVENT_CAP);
        },
        CAP_TEST_TIMEOUT_MS,
    );
});
