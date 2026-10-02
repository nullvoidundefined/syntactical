// Whole-bank rejections that hold unchanged from schema 1 to schema 2: the
// root shape and every schemaVersion other than the supported one.
import { describe, expect, it } from 'vitest';

import { validateQuestionBank } from '../validateQuestionBank.js';

// No fixture here carries a topic or misconceptionId, so the context lists none.
const CONTEXT = { topicIds: [], misconceptionIds: [] };

function buildBooleanQuestion(id: string): Record<string, unknown> {
    return {
        id,
        type: 'bool',
        prompt: 'Lists are mutable.',
        answer: true,
        query: { title: 'List mutability', explanation: 'Lists can be changed in place.' },
        provenance: {
            source: 'original',
            validation: { method: 'executed', status: 'passed' },
            isHumanReviewed: false,
        },
    };
}

function buildBank(questions: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { schemaVersion: 2, questions, ...overrides };
}

describe('validateQuestionBank rejects the whole bank', () => {
    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a string', 'bank'],
        ['an array of questions', [buildBooleanQuestion('q-1')]],
        ['missing its questions', { schemaVersion: 2 }],
        ['carrying questions as an object', buildBank({ 'q-1': buildBooleanQuestion('q-1') })],
        ['carrying questions as a string', buildBank('q-1')],
    ])('with the root shape rule when the root is %s', (_description, input) => {
        expect(validateQuestionBank(input, CONTEXT)).toEqual({ isValid: false, rule: 'root shape is invalid' });
    });

    it.each([
        ['newer than supported', 3],
        ['far newer than supported', 99],
        ['zero', 0],
        ['missing', undefined],
        ['a non-integer', 2.5],
        ['a numeric string', '2'],
        ['null', null],
        ['one (schema 1)', 1],
    ])('with the schemaVersion rule when schemaVersion is %s', (_description, schemaVersion) => {
        const bank = buildBank([buildBooleanQuestion('q-1')], { schemaVersion });
        expect(validateQuestionBank(bank, CONTEXT)).toEqual({
            isValid: false,
            rule: 'schemaVersion is not supported',
        });
    });

    it('with the schemaVersion rule when the bank has no schemaVersion key', () => {
        const bank = { questions: [buildBooleanQuestion('q-1')] };
        expect(validateQuestionBank(bank, CONTEXT)).toEqual({
            isValid: false,
            rule: 'schemaVersion is not supported',
        });
    });
});
