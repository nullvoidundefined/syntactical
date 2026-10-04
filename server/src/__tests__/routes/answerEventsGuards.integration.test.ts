// Guard tests for behavior that landed with B-32 and B-36 (Task 3.7): they pass against the
// current routes and fail if the behavior is removed. GET /v1/answer-events on an empty log,
// pages that end exactly on the page size (no empty trailing page), an upload/download round
// trip with server-derived isCorrect and upload-time received_at ordering, an upload landing
// mid-read that a following reader never skips, a repeated `after` parameter, and the per-user
// upload and download rate limits (B-63 keying) counted in separate scopes.
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { SYNC } from '../../constants/sync.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { rateLimitKey } from '../../services/rateLimitKey.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/answer-events';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const SETUP_TIMEOUT_MS = 120_000;
const PAGING_TIMEOUT_MS = 60_000;
const PAGE_SIZE = 500;
const MAX_BATCH = 200;
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

type RoundKind = 'bank' | 'review' | 'topic';

interface UploadEvent {
    answeredAt: string;
    bankKey: string;
    choiceIndex: number;
    eventId: string;
    isCorrect?: boolean;
    questionId: string;
    roundKind: RoundKind;
}

interface WireEvent {
    answeredAt: string;
    bankKey: string;
    choiceIndex: number;
    eventId: string;
    isCorrect: boolean;
    questionId: string;
    roundKind: RoundKind;
}

interface PageBody {
    data: { events: WireEvent[]; nextCursor: string | null };
}

type App = Parameters<typeof request>[0];

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function signIn(now: Date): Promise<{ authorization: string; userId: string }> {
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now });
    return { authorization: `Bearer ${sessionToken}`, userId };
}

// count events answered from startMs backwards a second apart, cycling questions and choices so
// some are right and some wrong; each carries the opposite of the true isCorrect, which the
// server must ignore.
function buildUploadBatch(count: number, startMs: number): UploadEvent[] {
    return Array.from({ length: count }, (_, index) => {
        const choiceIndex = index % CHOICE_COUNT;
        return {
            answeredAt: new Date(startMs - index * SECOND_MS).toISOString(),
            bankKey: BANK_KEY,
            choiceIndex,
            eventId: randomUUID(),
            isCorrect: choiceIndex !== ANSWER_INDEX,
            questionId: QUESTION_IDS[index % QUESTION_IDS.length],
            roundKind: 'bank',
        };
    });
}

// count rows inserted directly with distinct received_at values a millisecond apart from
// receivedFromMs, returned in the order the route must page them.
async function seedEvents(userId: string, count: number, receivedFromMs: number): Promise<string[]> {
    const eventIds = Array.from({ length: count }, () => randomUUID());
    await database.pool.query(
        `INSERT INTO answer_events
           (user_id, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, received_at)
         SELECT $1, e.event_id, $3, $4, 0, to_timestamp(($5::bigint + e.position) / 1000.0) - interval '1 minute',
                'bank', false, to_timestamp(($5::bigint + e.position) / 1000.0)
           FROM unnest($2::uuid[]) WITH ORDINALITY AS e(event_id, position)`,
        [userId, eventIds, BANK_KEY, QUESTION_IDS[0], receivedFromMs],
    );
    return eventIds;
}

function fetchPage(app: App, authorization: string, after?: string) {
    const call = request(app).get(ROUTE).set('Authorization', authorization);
    return after === undefined ? call : call.query({ after });
}

function upload(app: App, authorization: string, events: UploadEvent[]) {
    return request(app).post(ROUTE).set('Authorization', authorization).send({ events });
}

// Follows nextCursor from the given cursor to the end, returning every page.
async function readToEnd(app: App, authorization: string, after: string | null): Promise<PageBody[]> {
    const pages: PageBody[] = [];
    let cursor = after;
    while (cursor !== null) {
        const response = await fetchPage(app, authorization, cursor);
        expect(response.status).toBe(HTTP_OK);
        const body = response.body as PageBody;
        pages.push(body);
        cursor = body.data.nextCursor;
    }
    return pages;
}

function encodeCursor(receivedAt: string, eventId: string): string {
    return Buffer.from(JSON.stringify({ e: eventId, r: receivedAt })).toString('base64url');
}

function windowStartOf(now: Date): Date {
    const windowMs = SYNC.RATE_LIMIT.WINDOW_MS;
    return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

async function seedRateLimitCount(key: string, windowStart: Date, count: number): Promise<void> {
    await database.pool.query('INSERT INTO rate_limit_counters (key, window_start, count) VALUES ($1, $2, $3)', [
        key,
        windowStart,
        count,
    ]);
}

describe.skipIf(SKIP_DATABASE_TESTS)('answer event sync route guards', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database?.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('answers a user with no events with 200, an empty events list, and a null nextCursor', async () => {
        const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
        const { authorization } = await signIn(now());
        const other = await signIn(now());
        await seedEvents(other.userId, 3, now().getTime() - HOUR_MS);

        const response = await fetchPage(app, authorization);

        expect(response.status).toBe(HTTP_OK);
        expect(response.body).toEqual({ data: { events: [], nextCursor: null } });
    });

    it('returns exactly 500 events as one page with a null nextCursor', async () => {
        const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
        const { authorization, userId } = await signIn(now());
        const seeded = await seedEvents(userId, PAGE_SIZE, now().getTime() - HOUR_MS);

        const response = await fetchPage(app, authorization);

        expect(response.status).toBe(HTTP_OK);
        const body = response.body as PageBody;
        expect(body.data.events.map((event) => event.eventId)).toEqual(seeded);
        expect(body.data.nextCursor).toBeNull();
    });

    it(
        'returns exactly 1,000 events as 500 then 500, the second page ending with a null nextCursor',
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const { authorization, userId } = await signIn(now());
            const seeded = await seedEvents(userId, 2 * PAGE_SIZE, now().getTime() - HOUR_MS);

            const first = await fetchPage(app, authorization);
            expect(first.status).toBe(HTTP_OK);
            const firstBody = first.body as PageBody;
            expect(firstBody.data.events).toHaveLength(PAGE_SIZE);
            expect(typeof firstBody.data.nextCursor).toBe('string');

            const second = await fetchPage(app, authorization, firstBody.data.nextCursor as string);
            expect(second.status).toBe(HTTP_OK);
            const secondBody = second.body as PageBody;
            expect(secondBody.data.events).toHaveLength(PAGE_SIZE);
            expect(secondBody.data.nextCursor).toBeNull();

            const returnedIds = [...firstBody.data.events, ...secondBody.data.events].map((event) => event.eventId);
            expect(returnedIds).toEqual(seeded);
        },
        PAGING_TIMEOUT_MS,
    );

    it('round-trips two uploaded batches: each event once, server-derived isCorrect, second batch after the first', async () => {
        const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
        const { authorization } = await signIn(now());
        // The second batch was answered earlier than the first, so only an upload-time received_at
        // (not answered_at, not the request clock) puts it after the first.
        const firstBatch = buildUploadBatch(MAX_BATCH, now().getTime() - 3 * MINUTE_MS);
        const secondBatch = buildUploadBatch(50, now().getTime() - 2 * HOUR_MS);

        const firstUpload = await upload(app, authorization, firstBatch);
        const secondUpload = await upload(app, authorization, secondBatch);
        expect(firstUpload.status).toBe(HTTP_OK);
        expect(firstUpload.body.data.insertedCount).toBe(firstBatch.length);
        expect(secondUpload.status).toBe(HTTP_OK);
        expect(secondUpload.body.data.insertedCount).toBe(secondBatch.length);

        const response = await fetchPage(app, authorization);

        expect(response.status).toBe(HTTP_OK);
        const body = response.body as PageBody;
        expect(body.data.nextCursor).toBeNull();
        const returnedIds = body.data.events.map((event) => event.eventId);
        expect(returnedIds).toHaveLength(firstBatch.length + secondBatch.length);
        expect(new Set(returnedIds).size).toBe(returnedIds.length);
        expect(new Set(returnedIds.slice(0, firstBatch.length))).toEqual(
            new Set(firstBatch.map((event) => event.eventId)),
        );
        expect(new Set(returnedIds.slice(firstBatch.length))).toEqual(new Set(secondBatch.map((event) => event.eventId)));

        const uploadedById = new Map([...firstBatch, ...secondBatch].map((event) => [event.eventId, event]));
        for (const event of body.data.events) {
            const sent = uploadedById.get(event.eventId) as UploadEvent;
            expect({ ...event, answeredAt: Date.parse(event.answeredAt) }).toEqual({
                answeredAt: Date.parse(sent.answeredAt),
                bankKey: sent.bankKey,
                choiceIndex: sent.choiceIndex,
                eventId: sent.eventId,
                isCorrect: sent.choiceIndex === ANSWER_INDEX,
                questionId: sent.questionId,
                roundKind: sent.roundKind,
            });
        }
        expect(body.data.events.some((event) => event.isCorrect)).toBe(true);
        expect(body.data.events.some((event) => !event.isCorrect)).toBe(true);
    });

    it(
        'never skips an upload that commits after a reader took page 1; it appears on a later page',
        async () => {
            const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
            const { authorization, userId } = await signIn(now());
            // Seeded received_at values sit within the last hour; the late upload's answeredAt is two
            // hours back, so ordering it by anything but its upload time would put it behind the cursor.
            const seeded = await seedEvents(userId, 2 * PAGE_SIZE, now().getTime() - HOUR_MS);

            const first = await fetchPage(app, authorization);
            expect(first.status).toBe(HTTP_OK);
            const firstBody = first.body as PageBody;
            expect(firstBody.data.events).toHaveLength(PAGE_SIZE);

            const late = buildUploadBatch(10, now().getTime() - 2 * HOUR_MS);
            const lateUpload = await upload(app, authorization, late);
            expect(lateUpload.status).toBe(HTTP_OK);
            expect(lateUpload.body.data.insertedCount).toBe(late.length);

            const laterPages = await readToEnd(app, authorization, firstBody.data.nextCursor);
            const laterIds = laterPages.flatMap((page) => page.data.events.map((event) => event.eventId));
            const allIds = [...firstBody.data.events.map((event) => event.eventId), ...laterIds];

            expect(new Set(allIds).size).toBe(allIds.length);
            expect(allIds).toHaveLength(seeded.length + late.length);
            expect(allIds.slice(0, seeded.length)).toEqual(seeded);
            expect(new Set(laterIds.slice(-late.length))).toEqual(new Set(late.map((event) => event.eventId)));
        },
        PAGING_TIMEOUT_MS,
    );

    it('answers the after parameter given twice with 400 INPUT_INVALID_QUERY', async () => {
        const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
        const { authorization, userId } = await signIn(now());
        await seedEvents(userId, 3, now().getTime() - HOUR_MS);
        // Each value alone is a well-formed cursor, so only the repetition is wrong.
        const receivedAt = new Date(now().getTime() - 2 * HOUR_MS).toISOString().replace('Z', '000Z');
        const firstCursor = encodeCursor(receivedAt, randomUUID());
        const secondCursor = encodeCursor(receivedAt, randomUUID());
        const single = await fetchPage(app, authorization, firstCursor);
        expect(single.status).toBe(HTTP_OK);

        const response = await request(app)
            .get(`${ROUTE}?after=${firstCursor}&after=${secondCursor}`)
            .set('Authorization', authorization);

        expect(response.status).toBe(HTTP_BAD_REQUEST);
        expect(response.body.error.code).toBe('INPUT_INVALID_QUERY');
        expect(response.body.data).toBeUndefined();
    });

    it('answers the download past the per-user limit with 429 while uploads still pass', async () => {
        const { app, now, rateLimitKeySecret } = createSyncTestApp({ answerKey, pool: database.pool });
        const { authorization, userId } = await signIn(now());
        const downloadKey = rateLimitKey(rateLimitKeySecret, SYNC.RATE_LIMIT_SCOPE.DOWNLOAD, userId);
        await seedRateLimitCount(downloadKey, windowStartOf(now()), SYNC.RATE_LIMIT.DOWNLOAD_PER_USER - 1);

        const atLimit = await fetchPage(app, authorization);
        const pastLimit = await fetchPage(app, authorization);
        const uploadAfter = await upload(app, authorization, buildUploadBatch(1, now().getTime() - MINUTE_MS));

        expect(atLimit.status).toBe(HTTP_OK);
        expect(pastLimit.status).toBe(HTTP_TOO_MANY_REQUESTS);
        expect(pastLimit.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(pastLimit.body.data).toBeUndefined();
        expect(uploadAfter.status).toBe(HTTP_OK);
        expect(uploadAfter.body.data.insertedCount).toBe(1);
    });

    it('answers the upload past the per-user limit with 429, stores nothing, while downloads still pass', async () => {
        const { app, now, rateLimitKeySecret } = createSyncTestApp({ answerKey, pool: database.pool });
        const { authorization, userId } = await signIn(now());
        const uploadKey = rateLimitKey(rateLimitKeySecret, SYNC.RATE_LIMIT_SCOPE.UPLOAD, userId);
        await seedRateLimitCount(uploadKey, windowStartOf(now()), SYNC.RATE_LIMIT.UPLOAD_PER_USER - 1);
        const atLimitBatch = buildUploadBatch(1, now().getTime() - MINUTE_MS);
        const pastLimitBatch = buildUploadBatch(1, now().getTime() - 2 * MINUTE_MS);

        const atLimit = await upload(app, authorization, atLimitBatch);
        const pastLimit = await upload(app, authorization, pastLimitBatch);
        const downloadAfter = await fetchPage(app, authorization);

        expect(atLimit.status).toBe(HTTP_OK);
        expect(pastLimit.status).toBe(HTTP_TOO_MANY_REQUESTS);
        expect(pastLimit.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(pastLimit.body.data).toBeUndefined();
        expect(downloadAfter.status).toBe(HTTP_OK);
        expect((downloadAfter.body as PageBody).data.events.map((event) => event.eventId)).toEqual([
            atLimitBatch[0].eventId,
        ]);
    });
});
