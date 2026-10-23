// GET /v1/study-note writes one note per local week from the last 7 days of synced answers, once
// they number STUDY_NOTE.MIN_ANSWERS, and serves the stored note for the rest of that week. Until
// then it reports how many answers are missing; a failed or missing model stores nothing. The
// model is a fake that records each prompt.
import { randomUUID } from 'node:crypto';

import type { Question } from '@syntactical/content-schema';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { ModelProvider } from '../../clients/modelProvider.js';
import { STUDY_NOTE } from '../../constants/studyNote.js';
import { createFakeModelProvider } from '../../testing/fakeModelProvider.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createTestApp } from '../integration/createTestApp.js';
import { insertSession } from '../integration/insertSession.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const BANK = 'python/easy';
const MISCONCEPTION = 'python.list-alias-copies';
const DESCRIPTION = 'Believes assigning a list copies it.';
const PROVENANCE: Question['provenance'] = {
    isHumanReviewed: true,
    source: 'original',
    validation: { method: 'judged', status: 'passed' },
};

const question: Question = {
    answerIndex: 1,
    choices: [{ misconceptionId: MISCONCEPTION, text: '[1, 2]' }, { text: '[1, 2, 3]' }],
    id: 'py-easy-0',
    prompt: 'paid-or-private-prompt-marker',
    provenance: PROVENANCE,
    query: { explanation: 'b and a name the same list.', title: 'Names and objects' },
    type: 'mc',
};

const questions = new Map([[BANK, new Map<string, Question>([[question.id, question]])]]);
const labels = { languages: new Map([['python', 'Python']]), misconceptions: new Map([[MISCONCEPTION, DESCRIPTION]]) };

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function signIn(modelProvider: ModelProvider | null = createFakeModelProvider({ answer: 'A weekly note.' })) {
    const { app, clock } = createTestApp({
        pool: database.pool,
        studyNote: { labels, ...(modelProvider ? { modelProvider } : {}), questions },
    });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: clock.now() });
    return { app, clock, sessionToken, userId };
}

// Inserts answers to the fixture question: `wrong` of them pick the choice revealing the misconception.
async function insertAnswers(userId: string, count: number, answeredAt: Date, wrong = 0): Promise<void> {
    for (let index = 0; index < count; index += 1) {
        const isCorrect = index >= wrong;
        await database.pool.query(
            `INSERT INTO answer_events (user_id, event_id, bank_key, question_id, choice_index, is_correct, answered_at, round_kind)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'bank')`,
            [userId, randomUUID(), BANK, question.id, isCorrect ? 1 : 0, isCorrect, answeredAt],
        );
    }
}

function getNote(signed: Awaited<ReturnType<typeof signIn>>) {
    return request(signed.app)
        .get('/v1/study-note')
        .set('Authorization', `Bearer ${signed.sessionToken}`)
        .set('Origin', ALLOWED_ORIGIN);
}

describe.skipIf(SKIP_DATABASE_TESTS)('GET /v1/study-note', () => {
    beforeAll(async () => {
        database = await createMigratedDatabase(inject('testDatabaseUrl'));
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await database.drop();
    });

    beforeEach(async () => {
        await database.reset();
    });

    it('answers 401 without a session', async () => {
        const { app } = await signIn();

        const response = await request(app).get('/v1/study-note').set('Origin', ALLOWED_ORIGIN);

        expect(response.status).toBe(401);
    });

    it('reports the answers still missing, without calling the model, until the week holds enough', async () => {
        const model = createFakeModelProvider();
        const signed = await signIn(model);
        await insertAnswers(signed.userId, STUDY_NOTE.MIN_ANSWERS - 5, signed.clock.now());
        // Answers older than the 7-day window do not count.
        await insertAnswers(signed.userId, 10, new Date(signed.clock.now().getTime() - 8 * DAY_MS));

        const response = await getNote(signed);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: { remaining: 5, status: 'gathering' } });
        expect(response.headers['cache-control']).toContain('no-store');
        expect(model.prompts).toEqual([]);
    });

    it('writes the note from a summary of the week, never question text, and stores it', async () => {
        const model = createFakeModelProvider({ answer: 'You worked on lists this week.' });
        const signed = await signIn(model);
        await insertAnswers(signed.userId, STUDY_NOTE.MIN_ANSWERS, signed.clock.now(), 4);

        const response = await getNote(signed);

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ note: 'You worked on lists this week.', status: 'ready' });
        expect(response.body.data.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const [{ user }] = model.prompts;
        const summary = JSON.parse(user.replace('<week_summary>', '').replace('</week_summary>', ''));
        expect(summary).toEqual({
            answers: STUDY_NOTE.MIN_ANSWERS,
            banks: [{ answers: STUDY_NOTE.MIN_ANSWERS, correct: STUDY_NOTE.MIN_ANSWERS - 4, label: 'Python · Easy' }],
            correct: STUDY_NOTE.MIN_ANSWERS - 4,
            missedMisconceptions: [{ description: DESCRIPTION, misses: 4 }],
            reviewAnswers: 0,
        });
        expect(user).not.toContain('paid-or-private-prompt-marker');
    });

    it('serves the stored note for the rest of the week and writes a new one the next week', async () => {
        const model = createFakeModelProvider();
        const signed = await signIn(model);
        await insertAnswers(signed.userId, STUDY_NOTE.MIN_ANSWERS, signed.clock.now());

        const first = await getNote(signed);
        const again = await getNote(signed);
        expect(again.body).toEqual(first.body);
        expect(model.prompts).toHaveLength(1);

        signed.clock.advance(7 * DAY_MS);
        await insertAnswers(signed.userId, STUDY_NOTE.MIN_ANSWERS, signed.clock.now());
        const nextWeek = await getNote(signed);

        expect(nextWeek.body.data.weekStart).not.toBe(first.body.data.weekStart);
        expect(model.prompts).toHaveLength(2);
        const { rows } = await database.pool.query('SELECT week_start FROM study_notes WHERE user_id = $1', [
            signed.userId,
        ]);
        expect(rows).toHaveLength(1);
    });

    it("keys the week by the user's timezone", async () => {
        const signed = await signIn();
        await database.pool.query("UPDATE users SET timezone = 'Pacific/Kiritimati' WHERE id = $1", [signed.userId]);
        await insertAnswers(signed.userId, STUDY_NOTE.MIN_ANSWERS, signed.clock.now());

        const response = await getNote(signed);

        const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(
            signed.clock.now(),
        );
        const local = new Date(`${localDate}T00:00:00Z`);
        const daysAfterMonday = (local.getUTCDay() + 6) % 7;
        const monday = new Date(local.getTime() - daysAfterMonday * DAY_MS).toISOString().slice(0, 10);
        expect(response.body.data.weekStart).toBe(monday);
    });

    it.each(['reject', 'decline'] as const)(
        'answers 503 STUDY_NOTE_UNAVAILABLE when the model call fails (%s) and stores nothing',
        async (failure) => {
            const signed = await signIn(createFakeModelProvider({ failure }));
            await insertAnswers(signed.userId, STUDY_NOTE.MIN_ANSWERS, signed.clock.now());

            const response = await getNote(signed);

            expect(response.status).toBe(503);
            expect(response.body.error.code).toBe('STUDY_NOTE_UNAVAILABLE');
            const { rows } = await database.pool.query('SELECT 1 FROM study_notes WHERE user_id = $1', [signed.userId]);
            expect(rows).toEqual([]);
        },
    );

    it('answers 503 when no model is configured, but still reports missing answers', async () => {
        const signed = await signIn(null);

        expect((await getNote(signed)).body.data).toEqual({ remaining: STUDY_NOTE.MIN_ANSWERS, status: 'gathering' });

        await insertAnswers(signed.userId, STUDY_NOTE.MIN_ANSWERS, signed.clock.now());
        const response = await getNote(signed);
        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe('STUDY_NOTE_UNAVAILABLE');
    });

    it('keeps one note when two requests write the same week at once', async () => {
        let count = 0;
        const model: ModelProvider = {
            answer: () => {
                count += 1;
                return Promise.resolve(`Note ${count}`);
            },
        };
        const signed = await signIn(model);
        await insertAnswers(signed.userId, STUDY_NOTE.MIN_ANSWERS, signed.clock.now());

        const [left, right] = await Promise.all([getNote(signed), getNote(signed)]);

        expect(left.body.data.note).toBe(right.body.data.note);
        const { rows } = await database.pool.query('SELECT note FROM study_notes WHERE user_id = $1', [signed.userId]);
        expect(rows).toEqual([{ note: left.body.data.note }]);
    });
});
