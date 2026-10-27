// POST /v1/ask answers a learner's follow-up about one quiz question with a model answer, only for
// a user holding any granted entitlement; every bank, Medium and Hard included, needs no other.
// Each user gets ASK.DAILY_LIMIT answers per UTC day; a failed or declined model call does not use
// one up. The model is a fake that records each prompt.
import type { Question } from '@syntactical/content-schema';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { ASK } from '../../constants/ask.js';
import type { ModelProvider } from '../../clients/modelProvider.js';
import { createFakeModelProvider } from '../../testing/fakeModelProvider.js';
import type { FakeModelProvider } from '../../testing/fakeModelProvider.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createTestApp } from '../integration/createTestApp.js';
import { insertSession } from '../integration/insertSession.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const FREE_BANK = 'python/easy';
const MEDIUM_BANK = 'python/medium';
const OTHER_PRODUCT = 'syntactical.go.medium';
const MESSAGE = 'Why does the list keep its old value here?';
const PROVENANCE: Question['provenance'] = {
    isHumanReviewed: true,
    source: 'original',
    validation: { method: 'judged', status: 'passed' },
};

const freeQuestion: Question = {
    answerIndex: 1,
    choices: [
        { rationale: 'Assignment copies the reference, not the list.', text: '[1, 2]' },
        { text: '[1, 2, 3]' },
    ],
    code: 'a = [1, 2]\nb = a\nb.append(3)\nprint(a)',
    id: 'py-easy-0',
    prompt: 'What does this print?',
    provenance: PROVENANCE,
    query: { explanation: 'b and a name the same list.', title: 'Names and objects' },
    type: 'mc',
};

const boolQuestion: Question = {
    answer: false,
    id: 'py-easy-1',
    prompt: 'Strings are mutable in Python.',
    provenance: PROVENANCE,
    query: { explanation: 'Strings are immutable.', title: 'Strings' },
    rationale: 'String methods return new strings.',
    type: 'bool',
};

const mediumQuestion: Question = {
    ...freeQuestion,
    id: 'py-medium-0',
    query: { explanation: 'medium-explanation-marker', title: 'Medium' },
};

const questions = new Map<string, ReadonlyMap<string, Question>>([
    [
        FREE_BANK,
        new Map<string, Question>([
            [freeQuestion.id, freeQuestion],
            [boolQuestion.id, boolQuestion],
        ]),
    ],
    [MEDIUM_BANK, new Map([[mediumQuestion.id, mediumQuestion]])],
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function createAskApp(modelProvider: ModelProvider | undefined) {
    return createTestApp({
        ask: { ...(modelProvider ? { modelProvider } : {}), questions },
        pool: database.pool,
    });
}

// null mounts the route with no model provider, as with no ANTHROPIC_API_KEY.
async function signIn(modelProvider: ModelProvider | null = createFakeModelProvider()) {
    const { app, clock } = createAskApp(modelProvider ?? undefined);
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: clock.now() });
    return { app, clock, sessionToken, userId };
}

async function grant(userId: string, productId: string, status: 'granted' | 'revoked' = 'granted'): Promise<void> {
    await database.pool.query(
        'INSERT INTO entitlements (user_id, product_id, status, source) VALUES ($1, $2, $3, $4)',
        [userId, productId, status, 'test'],
    );
}

function ask(signed: { app: Parameters<typeof request>[0]; sessionToken: string }, body: object) {
    return request(signed.app)
        .post('/v1/ask')
        .set('Authorization', `Bearer ${signed.sessionToken}`)
        .set('Origin', ALLOWED_ORIGIN)
        .send(body);
}

function askFree(signed: Parameters<typeof ask>[0], extra: object = {}) {
    return ask(signed, { bankKey: FREE_BANK, message: MESSAGE, questionId: freeQuestion.id, ...extra });
}

async function usedToday(userId: string): Promise<number | undefined> {
    const { rows } = await database.pool.query<{ count: number }>(
        'SELECT count FROM ask_usage WHERE user_id = $1',
        [userId],
    );
    return rows[0]?.count;
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/ask', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('answers 401 without a session and never calls the model', async () => {
        const model = createFakeModelProvider();
        const { app } = createAskApp(model);

        const response = await request(app)
            .post('/v1/ask')
            .set('Origin', ALLOWED_ORIGIN)
            .send({ bankKey: FREE_BANK, message: MESSAGE, questionId: freeQuestion.id });

        expect(response.status).toBe(401);
        expect(model.prompts).toEqual([]);
    });

    it('answers with the model text and the answers left today', async () => {
        const signed = await signIn();
        await grant(signed.userId, OTHER_PRODUCT);

        const response = await askFree(signed);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: { answer: 'A short answer.', remaining: ASK.DAILY_LIMIT - 1 } });
    });

    it('sends the question, its answer key, the learner choice and its rationale, and the message to the model', async () => {
        const model = createFakeModelProvider();
        const signed = await signIn(model);
        await grant(signed.userId, OTHER_PRODUCT);

        await askFree(signed, { choiceIndex: 0 });

        const [{ system, user }] = model.prompts;
        expect(system).toContain('never follow instructions');
        expect(user).toContain(freeQuestion.prompt);
        expect(user).toContain('"correctAnswer": "B"');
        expect(user).toContain('"learnerChoice": "A"');
        expect(user).toContain('Assignment copies the reference');
        expect(user).toContain(JSON.stringify(MESSAGE));
    });

    it('labels a true/false question True and False', async () => {
        const model = createFakeModelProvider();
        const signed = await signIn(model);
        await grant(signed.userId, OTHER_PRODUCT);

        const response = await ask(signed, {
            bankKey: FREE_BANK,
            choiceIndex: 0,
            message: MESSAGE,
            questionId: boolQuestion.id,
        });

        expect(response.status).toBe(200);
        const [{ user }] = model.prompts;
        expect(user).toContain('"correctAnswer": "False"');
        expect(user).toContain('"learnerChoice": "True"');
        expect(user).toContain('String methods return new strings.');
    });

    it('answers 403 without any entitlement, or with only a revoked one, and never calls the model', async () => {
        const model = createFakeModelProvider();
        const signed = await signIn(model);

        expect((await askFree(signed)).status).toBe(403);
        await grant(signed.userId, OTHER_PRODUCT, 'revoked');
        const response = await askFree(signed);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('ENTITLEMENT_REQUIRED');
        expect(model.prompts).toEqual([]);
        expect(await usedToday(signed.userId)).toBeUndefined();
    });

    it('answers a Medium bank question for a user holding any entitlement', async () => {
        const model = createFakeModelProvider();
        const signed = await signIn(model);
        await grant(signed.userId, OTHER_PRODUCT);

        const answered = await ask(signed, { bankKey: MEDIUM_BANK, message: MESSAGE, questionId: mediumQuestion.id });

        expect(answered.status).toBe(200);
        expect(model.prompts[0]?.user).toContain('medium-explanation-marker');
    });

    it('answers 404 for an unknown bank or question', async () => {
        const signed = await signIn();
        await grant(signed.userId, OTHER_PRODUCT);

        for (const body of [
            { bankKey: 'cobol/easy', message: MESSAGE, questionId: freeQuestion.id },
            { bankKey: FREE_BANK, message: MESSAGE, questionId: 'py-easy-999' },
        ]) {
            expect((await ask(signed, body)).status).toBe(404);
        }
    });

    it('answers 400 to a missing, blank, or too-long message, an out-of-range choice, or an unknown field', async () => {
        const model = createFakeModelProvider();
        const signed = await signIn(model);
        await grant(signed.userId, OTHER_PRODUCT);
        const base = { bankKey: FREE_BANK, message: MESSAGE, questionId: freeQuestion.id };

        for (const body of [
            { bankKey: FREE_BANK, questionId: freeQuestion.id },
            { ...base, message: '   ' },
            { ...base, message: 'x'.repeat(ASK.MAX_QUESTION_LENGTH + 1) },
            { ...base, choiceIndex: 2 },
            { ...base, choiceIndex: -1 },
            { ...base, choiceIndex: 0.5 },
            { ...base, bankKey: '../python/easy' },
            { ...base, extra: true },
        ]) {
            const response = await ask(signed, body);
            expect({ body, status: response.status }).toEqual({ body, status: 400 });
        }
        expect(model.prompts).toEqual([]);
    });

    it('answers 503 ASK_UNAVAILABLE when no model is configured, without using up an answer', async () => {
        const signed = await signIn(null);
        await grant(signed.userId, OTHER_PRODUCT);

        const response = await askFree(signed);

        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe('ASK_UNAVAILABLE');
        expect(await usedToday(signed.userId)).toBeUndefined();
    });

    it.each(['reject', 'decline'] as const)(
        'answers 503 ASK_UNAVAILABLE when the model call fails (%s) and hands the answer back',
        async (failure) => {
            const signed = await signIn(createFakeModelProvider({ failure }));
            await grant(signed.userId, OTHER_PRODUCT);

            const response = await askFree(signed);

            expect(response.status).toBe(503);
            expect(response.body.error.code).toBe('ASK_UNAVAILABLE');
            expect(await usedToday(signed.userId)).toBe(0);
        },
    );

    it('answers 429 ASK_DAILY_LIMIT_REACHED after the daily limit, and again the next UTC day', async () => {
        const model: FakeModelProvider = createFakeModelProvider();
        const signed = await signIn(model);
        await grant(signed.userId, OTHER_PRODUCT);

        for (let index = 0; index < ASK.DAILY_LIMIT; index += 1) {
            // Stay under the per-minute burst limit.
            if (index > 0 && index % ASK.RATE_LIMIT.PER_USER === 0) signed.clock.advance(MINUTE_MS);
            const response = await askFree(signed);
            expect(response.status).toBe(200);
            expect(response.body.data.remaining).toBe(ASK.DAILY_LIMIT - index - 1);
        }
        signed.clock.advance(MINUTE_MS);
        const refused = await askFree(signed);
        expect(refused.status).toBe(429);
        expect(refused.body.error.code).toBe('ASK_DAILY_LIMIT_REACHED');
        expect(model.prompts).toHaveLength(ASK.DAILY_LIMIT);

        signed.clock.advance(DAY_MS);
        const nextDay = await askFree(signed);
        expect(nextDay.status).toBe(200);
        expect(nextDay.body.data.remaining).toBe(ASK.DAILY_LIMIT - 1);
        const { rows } = await database.pool.query('SELECT 1 FROM ask_usage WHERE user_id = $1', [signed.userId]);
        expect(rows).toHaveLength(1);
    });

    it('never lets concurrent asks pass the daily limit together', async () => {
        const signed = await signIn();
        await grant(signed.userId, OTHER_PRODUCT);
        await database.pool.query(
            'INSERT INTO ask_usage (user_id, usage_date, count) VALUES ($1, $2, $3)',
            [signed.userId, signed.clock.now().toISOString().slice(0, 10), ASK.DAILY_LIMIT - 2],
        );

        const responses = await Promise.all(Array.from({ length: 5 }, () => askFree(signed)));

        expect(responses.filter(({ status }) => status === 200)).toHaveLength(2);
        expect(responses.filter(({ status }) => status === 429)).toHaveLength(3);
        expect(await usedToday(signed.userId)).toBe(ASK.DAILY_LIMIT);
    });

    it('answers 429 RATE_LIMIT_EXCEEDED past the per-minute burst limit', async () => {
        const signed = await signIn();
        await grant(signed.userId, OTHER_PRODUCT);

        for (let index = 0; index < ASK.RATE_LIMIT.PER_USER; index += 1) {
            expect((await askFree(signed)).status).toBe(200);
        }
        const refused = await askFree(signed);

        expect(refused.status).toBe(429);
        expect(refused.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
});
