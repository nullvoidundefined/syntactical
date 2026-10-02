// B-3b: the client validator's hardening. An empty topic or misconceptionId is
// malformed, and the provenance strings carry the display-field length cap and
// a closed set of validation statuses.
import { describe, expect, it } from 'vitest';

import { CONTENT_LIMITS } from '../contentLimits.js';
import { validateQuestionBank } from '../validateQuestionBank.js';

type QuestionFixture = Record<string, unknown>;

const OVER_DISPLAY_FIELD = 'x'.repeat(CONTENT_LIMITS.displayFieldLength + 1);

function buildProvenance(overrides: QuestionFixture = {}): QuestionFixture {
    return {
        source: 'generated',
        model: 'model-name',
        promptVersion: 'enrich-v3',
        runtimeVersion: 'python 3.13.1',
        validation: { method: 'executed', status: 'passed' },
        isHumanReviewed: false,
        ...overrides,
    };
}

function buildMultipleChoiceQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return {
        id,
        type: 'mc',
        prompt: 'What does `len([1, 2, 3])` return?',
        choices: [{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }],
        answerIndex: 2,
        query: { title: 'len() on a list', explanation: 'len returns the number of items in the list.' },
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

function buildBank(questions: unknown[]): Record<string, unknown> {
    return { schemaVersion: 2, questions };
}

function bankWithOneDrop(kept: unknown[], id: string, rule: string): Record<string, unknown> {
    return { isValid: true, questions: kept, droppedQuestionIds: [id], dropped: [{ id, rule }] };
}

describe('validateQuestionBank hardening (B-3b)', () => {
    describe('drops an empty display field as a malformed question', () => {
        it('drops an mc question whose topic is the empty string', () => {
            const kept = buildBooleanQuestion('q-1');
            const malformed = buildMultipleChoiceQuestion('q-2', { topic: '' });
            const result = validateQuestionBank(buildBank([kept, malformed]));
            expect(result).toEqual(bankWithOneDrop([kept], 'q-2', 'malformed question'));
        });

        it('drops a bool question whose topic is the empty string', () => {
            const kept = buildMultipleChoiceQuestion('q-1');
            const malformed = buildBooleanQuestion('q-2', { topic: '' });
            const result = validateQuestionBank(buildBank([kept, malformed]));
            expect(result).toEqual(bankWithOneDrop([kept], 'q-2', 'malformed question'));
        });

        it('drops an mc question whose choice misconceptionId is the empty string', () => {
            const kept = buildBooleanQuestion('q-1');
            const malformed = buildMultipleChoiceQuestion('q-2', {
                choices: [{ text: '1' }, { text: '2', misconceptionId: '' }, { text: '3' }],
            });
            const result = validateQuestionBank(buildBank([kept, malformed]));
            expect(result).toEqual(bankWithOneDrop([kept], 'q-2', 'malformed question'));
        });

        it('drops a bool question whose misconceptionId is the empty string', () => {
            const kept = buildMultipleChoiceQuestion('q-1');
            const malformed = buildBooleanQuestion('q-2', { misconceptionId: '' });
            const result = validateQuestionBank(buildBank([kept, malformed]));
            expect(result).toEqual(bankWithOneDrop([kept], 'q-2', 'malformed question'));
        });
    });

    describe('drops provenance strings over the display-field length with the missing-provenance rule', () => {
        it.each([
            ['model', buildProvenance({ model: OVER_DISPLAY_FIELD })],
            ['promptVersion', buildProvenance({ promptVersion: OVER_DISPLAY_FIELD })],
            ['runtimeVersion', buildProvenance({ runtimeVersion: OVER_DISPLAY_FIELD })],
        ])('drops a question whose provenance %s is 121 characters', (_field, provenance) => {
            const kept = buildBooleanQuestion('q-1');
            const malformed = buildMultipleChoiceQuestion('q-2', { provenance });
            const result = validateQuestionBank(buildBank([kept, malformed]));
            expect(result).toEqual(bankWithOneDrop([kept], 'q-2', 'missing-provenance'));
        });
    });

    describe('drops a validation status outside pending, passed, and failed with the missing-provenance rule', () => {
        it.each([
            ['an unknown word', 'needs-review'],
            ['an uppercase known status', 'PASSED'],
            ['the empty string', ''],
            ['a 121-character string', OVER_DISPLAY_FIELD],
        ])('drops an mc question whose validation status is %s', (_description, status) => {
            const kept = buildBooleanQuestion('q-1');
            const malformed = buildMultipleChoiceQuestion('q-2', {
                provenance: buildProvenance({ validation: { method: 'executed', status } }),
            });
            const result = validateQuestionBank(buildBank([kept, malformed]));
            expect(result).toEqual(bankWithOneDrop([kept], 'q-2', 'missing-provenance'));
        });

        it('drops a bool question whose judged validation status is unknown', () => {
            const kept = buildMultipleChoiceQuestion('q-1');
            const malformed = buildBooleanQuestion('q-2', {
                provenance: buildProvenance({ validation: { method: 'judged', status: 'needs-review' } }),
            });
            const result = validateQuestionBank(buildBank([kept, malformed]));
            expect(result).toEqual(bankWithOneDrop([kept], 'q-2', 'missing-provenance'));
        });
    });
});
