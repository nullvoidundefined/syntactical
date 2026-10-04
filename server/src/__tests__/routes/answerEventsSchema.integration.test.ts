// The upload schema fed its insecure values (R-109, PR #32 review): each malformed event field
// or batch shape is a 400 INPUT_INVALID_BODY for the whole batch, and nothing is stored, not
// even the valid event sent beside it.
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
const HTTP_BAD_REQUEST = 400;
const SETUP_TIMEOUT_MS = 120_000;
const MINUTE_MS = 60_000;
const BANK_KEY = 'python/easy';
const QUESTION_ID = 'py-easy-001';

const answerKey: AnswerKey = new Map([
    [BANK_KEY, new Map<string, AnswerKeyEntry>([[QUESTION_ID, { answerIndex: 1, choiceCount: 4 }]])],
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function validEvent(now: Date): Record<string, unknown> {
    return {
        answeredAt: new Date(now.getTime() - MINUTE_MS).toISOString(),
        bankKey: BANK_KEY,
        choiceIndex: 1,
        eventId: randomUUID(),
        questionId: QUESTION_ID,
        roundKind: 'bank',
    };
}

const BAD_FIELDS: [string, Record<string, unknown>][] = [
    ['a negative choiceIndex', { choiceIndex: -1 }],
    ['a fractional choiceIndex', { choiceIndex: 1.5 }],
    ['a string choiceIndex', { choiceIndex: '1' }],
    ['an eventId that is not a uuid', { eventId: 'not-a-uuid' }],
    ['an unknown roundKind', { roundKind: 'admin' }],
    ['an answeredAt that is not a date-time', { answeredAt: 'yesterday' }],
    ['a 65-character bankKey', { bankKey: 'b'.repeat(65) }],
    ['a 129-character questionId', { questionId: 'q'.repeat(129) }],
];

const BAD_BATCHES: [string, unknown][] = [
    ['events as an object with a huge length', { events: { length: 1_000_000_000 } }],
    ['no events key', {}],
    ['events as a string', { events: 'all of them' }],
    ['events holding a non-object', { events: [42] }],
];

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/answer-events schema', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    async function postAs(body: unknown) {
        const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
        const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
        const response = await request(app).post(ROUTE).set('Authorization', `Bearer ${sessionToken}`).send(body as object);
        const { rows } = await database.pool.query<{ count: string }>(
            'SELECT count(*) FROM answer_events WHERE user_id = $1',
            [userId],
        );
        return { now, response, storedCount: Number(rows[0].count) };
    }

    it.each(BAD_FIELDS)('refuses a batch with %s beside a valid event, storing nothing', async (_label, override) => {
        const now = new Date();
        const { response, storedCount } = await postAs({
            events: [validEvent(now), { ...validEvent(now), ...override }],
        });

        expect(response.status).toBe(HTTP_BAD_REQUEST);
        expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
        expect(storedCount).toBe(0);
    });

    it.each(BAD_BATCHES)('refuses %s, storing nothing', async (_label, body) => {
        const { response, storedCount } = await postAs(body);

        expect(response.status).toBe(HTTP_BAD_REQUEST);
        expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
        expect(storedCount).toBe(0);
    });

    it('refuses an empty events array', async () => {
        const { response, storedCount } = await postAs({ events: [] });

        expect(response.status).toBe(HTTP_BAD_REQUEST);
        expect(response.body.error.code).toBe('INPUT_INVALID_BODY');
        expect(storedCount).toBe(0);
    });
});
