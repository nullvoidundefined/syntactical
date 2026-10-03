import { describe, expect, it } from 'vitest';

import { validateQuestionBank } from '../validateQuestionBank.js';

type QuestionFixture = Record<string, unknown>;

const MAX_RATIONALE_LENGTH = 280;

const CONTEXT = {
    topicIds: ['iterables', 't'.repeat(120)],
    misconceptionIds: ['python.x', 'python.lists-immutable', 'm'.repeat(120)],
};

function buildProvenance(overrides: QuestionFixture = {}): QuestionFixture {
    return {
        source: 'original',
        validation: { method: 'executed', status: 'passed' },
        isHumanReviewed: false,
        ...overrides,
    };
}

function buildChoices(texts: string[]): QuestionFixture[] {
    return texts.map((text) => ({ text }));
}

function buildMultipleChoiceQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return {
        id,
        type: 'mc',
        prompt: 'What does `len([1, 2, 3])` return?',
        code: 'len([1, 2, 3])',
        choices: buildChoices(['1', '2', '3', '4']),
        answerIndex: 2,
        query: {
            title: 'len() on a list',
            explanation: 'len returns the number of items in the list.',
            syntax: 'len(sequence)',
            tags: ['builtins', 'lists'],
        },
        provenance: buildProvenance(),
        ...overrides,
    };
}

function buildBooleanQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return {
        id,
        type: 'bool',
        prompt: 'Lists are mutable.',
        answer: true,
        query: { title: 'List mutability', explanation: 'Lists can be changed in place.' },
        provenance: buildProvenance(),
        ...overrides,
    };
}

function buildQuery(overrides: QuestionFixture): QuestionFixture {
    return { title: 'len() on a list', explanation: 'len returns the number of items.', ...overrides };
}

function buildBank(questions: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { schemaVersion: 2, questions, ...overrides };
}

function buildQuestionIds(count: number): string[] {
    return Array.from({ length: count }, (_unused, index) => `q-${index + 1}`);
}

function acceptedBank(questions: unknown[]): Record<string, unknown> {
    return { isValid: true, questions, droppedQuestionIds: [], dropped: [] };
}

function bankWithDrops(questions: unknown[], drops: { id: string; rule?: string }[]): Record<string, unknown> {
    return {
        isValid: true,
        questions,
        droppedQuestionIds: drops.map((drop) => drop.id),
        dropped: drops.map((drop) => ({ id: drop.id, rule: drop.rule ?? 'malformed question' })),
    };
}

describe('validateQuestionBank (schema 2)', () => {
    describe('accepts well-formed questions', () => {
        it('keeps every valid question and drops none', () => {
            const questions = [buildMultipleChoiceQuestion('q-1'), buildBooleanQuestion('q-2')];
            expect(validateQuestionBank(buildBank(questions), CONTEXT)).toEqual(acceptedBank(questions));
        });

        it('keeps an mc question with object choices, rationale, and misconceptionId but no topic, unchanged', () => {
            const question = buildMultipleChoiceQuestion('q-1', {
                choices: [
                    { text: '1' },
                    { text: '2', rationale: 'Counted from zero.', misconceptionId: 'python.x' },
                    { text: '3' },
                    { text: '4', rationale: 'Counted the brackets.' },
                ],
            });
            expect(question).not.toHaveProperty('topic');
            const result = validateQuestionBank(buildBank([question]), CONTEXT);
            expect(result).toEqual(acceptedBank([question]));
            if (result.isValid) expect(result.questions[0]).toStrictEqual(question);
        });

        it('keeps an mc question that carries a topic', () => {
            const question = buildMultipleChoiceQuestion('q-1', { topic: 'iterables' });
            expect(validateQuestionBank(buildBank([question]), CONTEXT)).toEqual(acceptedBank([question]));
        });

        it('keeps a bool question with a rationale and a misconceptionId', () => {
            const question = buildBooleanQuestion('q-1', {
                rationale: 'Tuples are the immutable sequence, not lists.',
                misconceptionId: 'python.lists-immutable',
            });
            expect(validateQuestionBank(buildBank([question]), CONTEXT)).toEqual(acceptedBank([question]));
        });

        it.each([
            ['a 2,000-character prompt', { prompt: 'p'.repeat(2000) }],
            ['two choices', { choices: buildChoices(['yes', 'no']), answerIndex: 1 }],
            ['answerIndex 0', { answerIndex: 0 }],
            ['a 300-character choice text', { choices: buildChoices(['c'.repeat(300), 'b']), answerIndex: 0 }],
            ['a choice with code', { choices: [{ text: 'a', code: 'print(1)' }, { text: 'b' }], answerIndex: 0 }],
            [
                'a choice with 4,000-character code',
                { choices: [{ text: 'a', code: 'x'.repeat(4000) }, { text: 'b' }], answerIndex: 0 },
            ],
            [
                'a 280-character rationale on a wrong choice',
                { choices: [{ text: 'a' }, { text: 'b', rationale: 'r'.repeat(MAX_RATIONALE_LENGTH) }], answerIndex: 0 },
            ],
            ['4,000-character code', { code: 'x'.repeat(4000) }],
            ['no code', { code: undefined }],
            ['a 64-character id', { id: 'a'.repeat(64) }],
            ['a 200-character query title', { query: buildQuery({ title: 't'.repeat(200) }) }],
            ['a 4,000-character explanation', { query: buildQuery({ explanation: 'e'.repeat(4000) }) }],
            ['4,000-character query syntax', { query: buildQuery({ syntax: 's'.repeat(4000) }) }],
            ['ten 40-character tags', { query: buildQuery({ tags: Array.from({ length: 10 }, () => 't'.repeat(40)) }) }],
            ['no optional query fields', { query: buildQuery({}) }],
            [
                'generated, judged provenance with every optional field',
                {
                    provenance: {
                        source: 'generated',
                        model: 'model-name',
                        promptVersion: 'enrich-v3',
                        runtimeVersion: 'python 3.13.1',
                        validation: { method: 'judged', status: 'pending' },
                        isHumanReviewed: true,
                    },
                },
            ],
            [
                'executed provenance whose status is failed',
                { provenance: buildProvenance({ validation: { method: 'executed', status: 'failed' } }) },
            ],
            [
                'executed provenance whose status is pending',
                { provenance: buildProvenance({ validation: { method: 'executed', status: 'pending' } }) },
            ],
            [
                '120-character provenance model, promptVersion, and runtimeVersion',
                {
                    provenance: buildProvenance({
                        source: 'generated',
                        model: 'm'.repeat(120),
                        promptVersion: 'p'.repeat(120),
                        runtimeVersion: 'r'.repeat(120),
                    }),
                },
            ],
            ['a 120-character topic', { topic: 't'.repeat(120) }],
            [
                'a 120-character choice misconceptionId',
                { choices: [{ text: 'a' }, { text: 'b', misconceptionId: 'm'.repeat(120) }], answerIndex: 0 },
            ],
        ])('keeps a multiple-choice question with %s', (_description, overrides) => {
            const question = buildMultipleChoiceQuestion('q-1', overrides);
            if (question.code === undefined) delete question.code;
            expect(validateQuestionBank(buildBank([question]), CONTEXT)).toEqual(acceptedBank([question]));
        });

        it('keeps a bool question with a 120-character topic and misconceptionId', () => {
            const question = buildBooleanQuestion('q-1', { topic: 't'.repeat(120), misconceptionId: 'm'.repeat(120) });
            expect(validateQuestionBank(buildBank([question]), CONTEXT)).toEqual(acceptedBank([question]));
        });

        it('keeps a bool question whose answer is false', () => {
            const question = buildBooleanQuestion('q-1', { answer: false });
            expect(validateQuestionBank(buildBank([question]), CONTEXT)).toEqual(acceptedBank([question]));
        });

        it('keeps a bool question with a 280-character rationale', () => {
            const question = buildBooleanQuestion('q-1', { rationale: 'r'.repeat(MAX_RATIONALE_LENGTH) });
            expect(validateQuestionBank(buildBank([question]), CONTEXT)).toEqual(acceptedBank([question]));
        });

        it('keeps markup inside strings as plain data', () => {
            const question = buildMultipleChoiceQuestion('q-1', {
                prompt: '<script>alert(1)</script>',
                code: '<img src=x onerror=alert(1)>',
                choices: [
                    { text: '<b>bold</b>', code: '<svg onload=alert(1)>' },
                    { text: '&lt;escaped&gt;', rationale: '<a href="javascript:alert(1)">x</a>' },
                ],
                answerIndex: 0,
            });
            expect(validateQuestionBank(buildBank([question]), CONTEXT)).toEqual(acceptedBank([question]));
        });

        it('accepts exactly 500 questions', () => {
            const questions = buildQuestionIds(500).map((id) => buildBooleanQuestion(id));
            const result = validateQuestionBank(buildBank(questions), CONTEXT);
            expect(result.isValid).toBe(true);
            if (result.isValid) expect(result.questions).toHaveLength(500);
        });
    });

    describe('drops each malformed question and keeps the rest of the bank', () => {
        it.each([
            ['a missing prompt', { prompt: undefined }],
            ['an empty prompt', { prompt: '' }],
            ['a prompt over 2,000 characters', { prompt: 'p'.repeat(2001) }],
            ['a non-string prompt', { prompt: 42 }],
            ['a missing query', { query: undefined }],
            ['a null query', { query: null }],
            ['a string query', { query: 'len' }],
            ['a missing query title', { query: { explanation: 'e' } }],
            ['an empty query title', { query: buildQuery({ title: '' }) }],
            ['a query title over 200 characters', { query: buildQuery({ title: 't'.repeat(201) }) }],
            ['a non-string query title', { query: buildQuery({ title: 3 }) }],
            ['a missing explanation', { query: { title: 't' } }],
            ['an empty explanation', { query: buildQuery({ explanation: '' }) }],
            ['an explanation over 4,000 characters', { query: buildQuery({ explanation: 'e'.repeat(4001) }) }],
            ['a non-string explanation', { query: buildQuery({ explanation: ['e'] }) }],
            ['non-string query syntax', { query: buildQuery({ syntax: 12 }) }],
            ['query syntax over 4,000 characters', { query: buildQuery({ syntax: 's'.repeat(4001) }) }],
            ['tags that are not an array', { query: buildQuery({ tags: 'builtins' }) }],
            ['more than 10 tags', { query: buildQuery({ tags: Array.from({ length: 11 }, (_u, i) => `t${i}`) }) }],
            ['a tag over 40 characters', { query: buildQuery({ tags: ['t'.repeat(41)] }) }],
            ['a non-string tag', { query: buildQuery({ tags: [7] }) }],
            ['non-string code', { code: 12 }],
            ['null code', { code: null }],
            ['code over 4,000 characters', { code: 'x'.repeat(4001) }],
            ['an unknown type', { type: 'text' }],
            ['a missing type', { type: undefined }],
            ['an uppercase type', { type: 'MC' }],
            ['a non-string topic', { topic: 42 }],
            ['a topic over 120 characters', { topic: 't'.repeat(121) }],
            ['missing choices', { choices: undefined }],
            ['choices that are not an array', { choices: 'a,b' }],
            ['one choice', { choices: buildChoices(['only']), answerIndex: 0 }],
            ['five choices', { choices: buildChoices(['a', 'b', 'c', 'd', 'e']), answerIndex: 0 }],
            ['schema-1 string choices', { choices: ['1', '2', '3', '4'] }],
            ['one string choice among objects', { choices: [{ text: 'a' }, 'b'], answerIndex: 0 }],
            ['a null choice', { choices: [{ text: 'a' }, null], answerIndex: 0 }],
            ['a choice missing text', { choices: [{ text: 'a' }, { rationale: 'r' }], answerIndex: 0 }],
            ['an empty choice text', { choices: buildChoices(['a', '']), answerIndex: 0 }],
            ['a non-string choice text', { choices: [{ text: 'a' }, { text: 2 }], answerIndex: 0 }],
            ['a choice text over 300 characters', { choices: buildChoices(['c'.repeat(301), 'b']), answerIndex: 0 }],
            ['non-string choice code', { choices: [{ text: 'a', code: 12 }, { text: 'b' }], answerIndex: 0 }],
            [
                'choice code over 4,000 characters',
                { choices: [{ text: 'a', code: 'x'.repeat(4001) }, { text: 'b' }], answerIndex: 0 },
            ],
            ['a non-string choice rationale', { choices: [{ text: 'a' }, { text: 'b', rationale: 7 }], answerIndex: 0 }],
            [
                'a non-string choice misconceptionId',
                { choices: [{ text: 'a' }, { text: 'b', misconceptionId: 7 }], answerIndex: 0 },
            ],
            [
                'a choice misconceptionId over 120 characters',
                { choices: [{ text: 'a' }, { text: 'b', misconceptionId: 'm'.repeat(121) }], answerIndex: 0 },
            ],
            ['a missing answerIndex', { answerIndex: undefined }],
            ['a negative answerIndex', { answerIndex: -1 }],
            ['an answerIndex equal to the choice count', { answerIndex: 4 }],
            ['an answerIndex past the choices', { answerIndex: 9 }],
            ['a non-integer answerIndex', { answerIndex: 1.5 }],
            ['a string answerIndex', { answerIndex: '1' }],
            ['a NaN answerIndex', { answerIndex: Number.NaN }],
        ])('drops a multiple-choice question with %s', (_description, overrides) => {
            const keptFirst = buildMultipleChoiceQuestion('q-1');
            const malformed = buildMultipleChoiceQuestion('q-2', overrides);
            const keptLast = buildBooleanQuestion('q-3');
            const result = validateQuestionBank(buildBank([keptFirst, malformed, keptLast]), CONTEXT);
            expect(result).toEqual(bankWithDrops([keptFirst, keptLast], [{ id: 'q-2' }]));
        });

        it.each([
            ['a string answer', { answer: 'true' }],
            ['a numeric answer', { answer: 1 }],
            ['a missing answer', { answer: undefined }],
            ['a null answer', { answer: null }],
            ['a non-string rationale', { rationale: 7 }],
            ['a non-string misconceptionId', { misconceptionId: 7 }],
            ['a misconceptionId over 120 characters', { misconceptionId: 'm'.repeat(121) }],
            ['a topic over 120 characters', { topic: 't'.repeat(121) }],
        ])('drops a bool question with %s', (_description, overrides) => {
            const keptFirst = buildBooleanQuestion('q-1');
            const malformed = buildBooleanQuestion('q-2', overrides);
            const keptLast = buildMultipleChoiceQuestion('q-3');
            const result = validateQuestionBank(buildBank([keptFirst, malformed, keptLast]), CONTEXT);
            expect(result).toEqual(bankWithDrops([keptFirst, keptLast], [{ id: 'q-2' }]));
        });

        it.each([
            ['missing', undefined],
            ['null', null],
            ['a string', 'original'],
            ['an array', [buildProvenance()]],
            ['missing its source', buildProvenance({ source: undefined })],
            ['carrying an unknown source', buildProvenance({ source: 'scraped' })],
            ['missing its validation', buildProvenance({ validation: undefined })],
            ['carrying a null validation', buildProvenance({ validation: null })],
            ['carrying an unknown validation method', buildProvenance({ validation: { method: 'guessed', status: 'passed' } })],
            ['missing its validation method', buildProvenance({ validation: { status: 'passed' } })],
            ['missing its validation status', buildProvenance({ validation: { method: 'executed' } })],
            ['carrying a non-string validation status', buildProvenance({ validation: { method: 'executed', status: 1 } })],
            ['missing isHumanReviewed', buildProvenance({ isHumanReviewed: undefined })],
            ['carrying a string isHumanReviewed', buildProvenance({ isHumanReviewed: 'true' })],
            ['carrying a non-string model', buildProvenance({ model: 42 })],
            ['carrying a non-string promptVersion', buildProvenance({ promptVersion: 3 })],
            ['carrying a non-string runtimeVersion', buildProvenance({ runtimeVersion: 3.13 })],
        ])('drops a question whose provenance is %s with the missing-provenance rule', (_description, provenance) => {
            const keptFirst = buildMultipleChoiceQuestion('q-1');
            const malformed = buildMultipleChoiceQuestion('q-2', { provenance });
            if (provenance === undefined) delete malformed.provenance;
            const keptLast = buildBooleanQuestion('q-3');
            const result = validateQuestionBank(buildBank([keptFirst, malformed, keptLast]), CONTEXT);
            expect(result).toEqual(bankWithDrops([keptFirst, keptLast], [{ id: 'q-2', rule: 'missing-provenance' }]));
        });

        it('drops a bool question with no provenance with the missing-provenance rule', () => {
            const kept = buildMultipleChoiceQuestion('q-1');
            const malformed = buildBooleanQuestion('q-2');
            delete malformed.provenance;
            const result = validateQuestionBank(buildBank([kept, malformed]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'missing-provenance' }]));
        });

        it('drops an mc question whose wrong-choice rationale is over 280 characters with the rationale-too-long rule', () => {
            const kept = buildBooleanQuestion('q-1');
            const malformed = buildMultipleChoiceQuestion('q-2', {
                choices: [{ text: 'a' }, { text: 'b', rationale: 'r'.repeat(MAX_RATIONALE_LENGTH + 1) }],
                answerIndex: 0,
            });
            const result = validateQuestionBank(buildBank([kept, malformed]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'rationale-too-long' }]));
        });

        it('drops a bool question whose rationale is over 280 characters with the rationale-too-long rule', () => {
            const kept = buildMultipleChoiceQuestion('q-1');
            const malformed = buildBooleanQuestion('q-2', { rationale: 'r'.repeat(MAX_RATIONALE_LENGTH + 1) });
            const result = validateQuestionBank(buildBank([kept, malformed]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'rationale-too-long' }]));
        });

        it.each([
            ['missing', undefined],
            ['empty', ''],
            ['uppercase', 'Q-2'],
            ['containing an underscore', 'q_2'],
            ['containing a slash', 'q/2'],
            ['over 64 characters', 'a'.repeat(65)],
            ['a number', 2],
            ['null', null],
        ])('drops a question whose id is %s', (_description, id) => {
            const keptFirst = buildMultipleChoiceQuestion('q-1');
            const malformed = buildMultipleChoiceQuestion('placeholder', { id });
            const keptLast = buildBooleanQuestion('q-3');
            const result = validateQuestionBank(buildBank([keptFirst, malformed, keptLast]), CONTEXT);
            expect(result.isValid).toBe(true);
            if (result.isValid) {
                expect(result.questions).toEqual([keptFirst, keptLast]);
                expect(result.dropped).toEqual([{ id: expect.any(String), rule: 'malformed question' }]);
            }
        });

        it.each([
            ['null', null],
            ['a string', 'q-2'],
            ['a number', 2],
            ['an array', [buildBooleanQuestion('q-2')]],
        ])('drops a question entry that is %s', (_description, entry) => {
            const keptFirst = buildMultipleChoiceQuestion('q-1');
            const keptLast = buildBooleanQuestion('q-3');
            const result = validateQuestionBank(buildBank([keptFirst, entry, keptLast]), CONTEXT);
            expect(result.isValid).toBe(true);
            if (result.isValid) {
                expect(result.questions).toEqual([keptFirst, keptLast]);
                expect(result.dropped).toEqual([{ id: expect.any(String), rule: 'malformed question' }]);
            }
        });

        it('keeps the first of two questions sharing an id and drops the later one', () => {
            const original = buildMultipleChoiceQuestion('q-1');
            const duplicate = buildBooleanQuestion('q-1', { prompt: 'A different prompt.' });
            const other = buildBooleanQuestion('q-2');
            const result = validateQuestionBank(buildBank([original, duplicate, other]), CONTEXT);
            expect(result).toEqual(bankWithDrops([original, other], [{ id: 'q-1', rule: 'duplicate id' }]));
        });

        it('lists every dropped id and its rule in input order', () => {
            const missingProvenance = buildMultipleChoiceQuestion('q-4');
            delete missingProvenance.provenance;
            const questions = [
                buildBooleanQuestion('q-1', { answer: 'no' }),
                buildMultipleChoiceQuestion('q-2'),
                buildMultipleChoiceQuestion('q-3', { choices: buildChoices(['a']) }),
                missingProvenance,
                buildBooleanQuestion('q-5'),
                buildBooleanQuestion('q-6', { rationale: 'r'.repeat(MAX_RATIONALE_LENGTH + 1) }),
                buildMultipleChoiceQuestion('q-7', { prompt: '' }),
            ];
            const result = validateQuestionBank(buildBank(questions), CONTEXT);
            expect(result).toEqual(
                bankWithDrops(
                    [questions[1], questions[4]],
                    [
                        { id: 'q-1' },
                        { id: 'q-3' },
                        { id: 'q-4', rule: 'missing-provenance' },
                        { id: 'q-6', rule: 'rationale-too-long' },
                        { id: 'q-7' },
                    ],
                ),
            );
        });
    });

    describe('rejects the whole bank', () => {
        it('with the schemaVersion rule when the bank is schema 1', () => {
            const bank = buildBank([buildBooleanQuestion('q-1')], { schemaVersion: 1 });
            expect(validateQuestionBank(bank, CONTEXT)).toEqual({
                isValid: false,
                rule: 'schemaVersion is not supported',
            });
        });

        it('with the schemaVersion rule when a schema-1 bank holds schema-1 questions', () => {
            const v1Question = {
                id: 'q-1',
                type: 'mc',
                prompt: 'What does `len([1, 2, 3])` return?',
                choices: ['1', '2', '3', '4'],
                answerIndex: 2,
                query: { title: 'len() on a list', explanation: 'len returns the number of items.' },
            };
            expect(validateQuestionBank({ schemaVersion: 1, questions: [v1Question] }, CONTEXT)).toEqual({
                isValid: false,
                rule: 'schemaVersion is not supported',
            });
        });

        it('with the too-many rule when it holds more than 500 questions', () => {
            const questions = buildQuestionIds(501).map((id) => buildBooleanQuestion(id));
            expect(validateQuestionBank(buildBank(questions), CONTEXT)).toEqual({
                isValid: false,
                rule: 'too many questions',
            });
        });

        it('with the no-valid-questions rule when every question is malformed', () => {
            const questions = [
                buildBooleanQuestion('q-1', { answer: 'yes' }),
                buildMultipleChoiceQuestion('q-2', { choices: [] }),
            ];
            expect(validateQuestionBank(buildBank(questions), CONTEXT)).toEqual({
                isValid: false,
                rule: 'no valid questions',
            });
        });

        it('with the no-valid-questions rule when every question lacks provenance', () => {
            const questions = [buildBooleanQuestion('q-1'), buildMultipleChoiceQuestion('q-2')];
            for (const question of questions) delete question.provenance;
            expect(validateQuestionBank(buildBank(questions), CONTEXT)).toEqual({
                isValid: false,
                rule: 'no valid questions',
            });
        });

        it('with the no-valid-questions rule when the questions array is empty', () => {
            expect(validateQuestionBank(buildBank([]), CONTEXT)).toEqual({
                isValid: false,
                rule: 'no valid questions',
            });
        });
    });
});
