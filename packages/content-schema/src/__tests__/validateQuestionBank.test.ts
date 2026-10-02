import { describe, expect, it } from 'vitest';

import { validateQuestionBank } from '../validateQuestionBank.js';

type QuestionFixture = Record<string, unknown>;

function buildMultipleChoiceQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return {
        id,
        type: 'mc',
        prompt: 'What does `len([1, 2, 3])` return?',
        code: 'len([1, 2, 3])',
        choices: ['1', '2', '3', '4'],
        answerIndex: 2,
        query: {
            title: 'len() on a list',
            explanation: 'len returns the number of items in the list.',
            syntax: 'len(sequence)',
            tags: ['builtins', 'lists'],
        },
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
        ...overrides,
    };
}

function buildQuery(overrides: QuestionFixture): QuestionFixture {
    return { title: 'len() on a list', explanation: 'len returns the number of items.', ...overrides };
}

function buildBank(questions: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { schemaVersion: 1, questions, ...overrides };
}

function buildQuestionIds(count: number): string[] {
    return Array.from({ length: count }, (_unused, index) => `q-${index + 1}`);
}

describe('validateQuestionBank', () => {
    describe('accepts well-formed questions', () => {
        it('keeps every valid question and drops none', () => {
            const questions = [buildMultipleChoiceQuestion('q-1'), buildBooleanQuestion('q-2')];
            expect(validateQuestionBank(buildBank(questions))).toEqual({
                isValid: true,
                questions,
                droppedQuestionIds: [],
            });
        });

        it.each([
            ['a 2,000-character prompt', { prompt: 'p'.repeat(2000) }],
            ['two choices', { choices: ['yes', 'no'], answerIndex: 1 }],
            ['answerIndex 0', { answerIndex: 0 }],
            ['a 300-character choice', { choices: ['c'.repeat(300), 'b'], answerIndex: 0 }],
            ['4,000-character code', { code: 'x'.repeat(4000) }],
            ['no code', { code: undefined }],
            ['a 64-character id', { id: 'a'.repeat(64) }],
            ['a 200-character query title', { query: buildQuery({ title: 't'.repeat(200) }) }],
            ['a 4,000-character explanation', { query: buildQuery({ explanation: 'e'.repeat(4000) }) }],
            ['4,000-character query syntax', { query: buildQuery({ syntax: 's'.repeat(4000) }) }],
            ['ten 40-character tags', { query: buildQuery({ tags: Array.from({ length: 10 }, () => 't'.repeat(40)) }) }],
            ['no optional query fields', { query: buildQuery({}) }],
        ])('keeps a multiple-choice question with %s', (_description, overrides) => {
            const question = buildMultipleChoiceQuestion('q-1', overrides);
            if (question.code === undefined) delete question.code;
            const result = validateQuestionBank(buildBank([question]));
            expect(result).toEqual({ isValid: true, questions: [question], droppedQuestionIds: [] });
        });

        it('keeps a bool question whose answer is false', () => {
            const question = buildBooleanQuestion('q-1', { answer: false });
            expect(validateQuestionBank(buildBank([question]))).toEqual({
                isValid: true,
                questions: [question],
                droppedQuestionIds: [],
            });
        });

        it('keeps markup inside strings as plain data', () => {
            const question = buildMultipleChoiceQuestion('q-1', {
                prompt: '<script>alert(1)</script>',
                code: '<img src=x onerror=alert(1)>',
                choices: ['<b>bold</b>', '&lt;escaped&gt;'],
                answerIndex: 0,
            });
            const result = validateQuestionBank(buildBank([question]));
            expect(result).toEqual({ isValid: true, questions: [question], droppedQuestionIds: [] });
        });

        it('accepts exactly 500 questions', () => {
            const questions = buildQuestionIds(500).map((id) => buildBooleanQuestion(id));
            const result = validateQuestionBank(buildBank(questions));
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
            ['missing choices', { choices: undefined }],
            ['choices that are not an array', { choices: 'a,b' }],
            ['one choice', { choices: ['only'], answerIndex: 0 }],
            ['five choices', { choices: ['a', 'b', 'c', 'd', 'e'], answerIndex: 0 }],
            ['an empty choice', { choices: ['a', ''], answerIndex: 0 }],
            ['a non-string choice', { choices: ['a', 2], answerIndex: 0 }],
            ['a choice over 300 characters', { choices: ['c'.repeat(301), 'b'], answerIndex: 0 }],
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
            const result = validateQuestionBank(buildBank([keptFirst, malformed, keptLast]));
            expect(result).toEqual({
                isValid: true,
                questions: [keptFirst, keptLast],
                droppedQuestionIds: ['q-2'],
            });
        });

        it.each([
            ['a string answer', { answer: 'true' }],
            ['a numeric answer', { answer: 1 }],
            ['a missing answer', { answer: undefined }],
            ['a null answer', { answer: null }],
        ])('drops a bool question with %s', (_description, overrides) => {
            const keptFirst = buildBooleanQuestion('q-1');
            const malformed = buildBooleanQuestion('q-2', overrides);
            const keptLast = buildMultipleChoiceQuestion('q-3');
            const result = validateQuestionBank(buildBank([keptFirst, malformed, keptLast]));
            expect(result).toEqual({
                isValid: true,
                questions: [keptFirst, keptLast],
                droppedQuestionIds: ['q-2'],
            });
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
            const result = validateQuestionBank(buildBank([keptFirst, malformed, keptLast]));
            expect(result.isValid).toBe(true);
            if (result.isValid) expect(result.questions).toEqual([keptFirst, keptLast]);
        });

        it.each([
            ['null', null],
            ['a string', 'q-2'],
            ['a number', 2],
            ['an array', [buildBooleanQuestion('q-2')]],
        ])('drops a question entry that is %s', (_description, entry) => {
            const keptFirst = buildMultipleChoiceQuestion('q-1');
            const keptLast = buildBooleanQuestion('q-3');
            const result = validateQuestionBank(buildBank([keptFirst, entry, keptLast]));
            expect(result.isValid).toBe(true);
            if (result.isValid) expect(result.questions).toEqual([keptFirst, keptLast]);
        });

        it('keeps the first of two questions sharing an id and drops the later one', () => {
            const original = buildMultipleChoiceQuestion('q-1');
            const duplicate = buildBooleanQuestion('q-1', { prompt: 'A different prompt.' });
            const other = buildBooleanQuestion('q-2');
            const result = validateQuestionBank(buildBank([original, duplicate, other]));
            expect(result).toEqual({
                isValid: true,
                questions: [original, other],
                droppedQuestionIds: ['q-1'],
            });
        });

        it('lists every dropped id in input order', () => {
            const questions = [
                buildBooleanQuestion('q-1', { answer: 'no' }),
                buildMultipleChoiceQuestion('q-2'),
                buildMultipleChoiceQuestion('q-3', { choices: ['a'] }),
                buildBooleanQuestion('q-4'),
                buildMultipleChoiceQuestion('q-5', { prompt: '' }),
            ];
            const result = validateQuestionBank(buildBank(questions));
            expect(result).toEqual({
                isValid: true,
                questions: [questions[1], questions[3]],
                droppedQuestionIds: ['q-1', 'q-3', 'q-5'],
            });
        });
    });

    describe('rejects the whole bank', () => {
        it.each([
            ['null', null],
            ['undefined', undefined],
            ['a string', 'bank'],
            ['an array of questions', [buildBooleanQuestion('q-1')]],
            ['missing its questions', { schemaVersion: 1 }],
            ['carrying questions as an object', buildBank({ 'q-1': buildBooleanQuestion('q-1') })],
            ['carrying questions as a string', buildBank('q-1')],
        ])('with the root shape rule when the root is %s', (_description, input) => {
            expect(validateQuestionBank(input)).toEqual({ isValid: false, rule: 'root shape is invalid' });
        });

        it.each([
            ['newer than supported', 2],
            ['far newer than supported', 99],
            ['zero', 0],
        ])('with the schemaVersion rule when schemaVersion is %s', (_description, schemaVersion) => {
            const bank = buildBank([buildBooleanQuestion('q-1')], { schemaVersion });
            expect(validateQuestionBank(bank)).toEqual({
                isValid: false,
                rule: 'schemaVersion is not supported',
            });
        });

        it.each([
            ['missing', undefined],
            ['a non-integer', 1.5],
            ['a numeric string', '1'],
            ['null', null],
        ])('when schemaVersion is %s', (_description, schemaVersion) => {
            const bank = buildBank([buildBooleanQuestion('q-1')], { schemaVersion });
            expect(validateQuestionBank(bank).isValid).toBe(false);
        });

        it('with the too-many rule when it holds more than 500 questions', () => {
            const questions = buildQuestionIds(501).map((id) => buildBooleanQuestion(id));
            expect(validateQuestionBank(buildBank(questions))).toEqual({
                isValid: false,
                rule: 'too many questions',
            });
        });

        it('with the no-valid-questions rule when every question is malformed', () => {
            const questions = [
                buildBooleanQuestion('q-1', { answer: 'yes' }),
                buildMultipleChoiceQuestion('q-2', { choices: [] }),
            ];
            expect(validateQuestionBank(buildBank(questions))).toEqual({
                isValid: false,
                rule: 'no valid questions',
            });
        });

        it('when the questions array is empty', () => {
            expect(validateQuestionBank(buildBank([])).isValid).toBe(false);
        });
    });
});
