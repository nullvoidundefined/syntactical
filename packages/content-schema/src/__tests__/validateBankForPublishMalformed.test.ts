// B-4b: the publish validator does not trust its typed input. Pipeline content
// can reach it without passing the client validator, so a present topic or
// misconceptionId that is not a string is reported as malformed-reference,
// never silently skipped and never reported as merely missing.
import { describe, expect, it } from 'vitest';

import { validateBankForPublish } from '../validateBankForPublish.js';
import type { BankContext } from '../types/BankContext.js';

type QuestionFixture = Record<string, unknown>;

const CONTEXT: BankContext = {
    topicIds: ['iterables', 'strings'],
    misconceptionIds: ['python.off-by-one', 'python.x'],
};

const NON_STRING_VALUES: [string, unknown][] = [
    ['a number', 42],
    ['null', null],
    ['an object', { id: 'iterables' }],
    ['an array', ['iterables']],
];

function buildProvenance(): QuestionFixture {
    return { source: 'original', validation: { method: 'executed', status: 'passed' }, isHumanReviewed: false };
}

function buildEnrichedMultipleChoiceQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return {
        id,
        type: 'mc',
        topic: 'iterables',
        prompt: 'What does `len([1, 2, 3])` return?',
        choices: [
            { text: '1', rationale: 'Read len as the first item.', misconceptionId: 'python.x' },
            { text: '2', rationale: 'Counted from zero.', misconceptionId: 'python.off-by-one' },
            { text: '3' },
            { text: '4', rationale: 'Counted the brackets as an item.' },
        ],
        answerIndex: 2,
        query: { title: 'len() on a list', explanation: 'len returns the number of items in the list.' },
        provenance: buildProvenance(),
        ...overrides,
    };
}

function buildEnrichedBooleanQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return {
        id,
        type: 'bool',
        topic: 'iterables',
        prompt: 'Lists are mutable.',
        answer: true,
        rationale: 'Tuples are the immutable sequence, not lists.',
        misconceptionId: 'python.x',
        query: { title: 'List mutability', explanation: 'Lists can be changed in place.' },
        provenance: buildProvenance(),
        ...overrides,
    };
}

function publish(questions: QuestionFixture[]): { problems: { id: string; rule: string }[] } {
    const bank = { questions } as unknown as Parameters<typeof validateBankForPublish>[0];
    return validateBankForPublish(bank, CONTEXT);
}

describe('validateBankForPublish malformed references (B-4b)', () => {
    describe.each(NON_STRING_VALUES)('topic that is %s', (_label, value) => {
        it('reports malformed-reference, not missing-topic, for an mc question', () => {
            const question = buildEnrichedMultipleChoiceQuestion('q-1', { topic: value });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'malformed-reference' }] });
        });

        it('reports malformed-reference, not missing-topic, for a bool question', () => {
            const question = buildEnrichedBooleanQuestion('q-1', { topic: value });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'malformed-reference' }] });
        });
    });

    describe.each(NON_STRING_VALUES)('misconceptionId that is %s', (_label, value) => {
        it('reports malformed-reference for a wrong mc choice', () => {
            const question = buildEnrichedMultipleChoiceQuestion('q-1', {
                choices: [
                    { text: '1', rationale: 'Read len as the first item.', misconceptionId: value },
                    { text: '2', rationale: 'Counted from zero.', misconceptionId: 'python.off-by-one' },
                    { text: '3' },
                ],
            });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'malformed-reference' }] });
        });

        it('reports malformed-reference for the correct mc choice', () => {
            const question = buildEnrichedMultipleChoiceQuestion('q-1', {
                choices: [
                    { text: '1', rationale: 'Read len as the first item.' },
                    { text: '2', rationale: 'Counted from zero.' },
                    { text: '3', misconceptionId: value },
                ],
            });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'malformed-reference' }] });
        });

        it('reports malformed-reference for a bool question', () => {
            const question = buildEnrichedBooleanQuestion('q-1', { misconceptionId: value });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'malformed-reference' }] });
        });
    });

    it('reports only the malformed question in a bank with valid enriched questions around it', () => {
        const questions = [
            buildEnrichedMultipleChoiceQuestion('q-1'),
            buildEnrichedBooleanQuestion('q-2', { misconceptionId: 7 }),
            buildEnrichedBooleanQuestion('q-3'),
        ];
        expect(publish(questions)).toEqual({ problems: [{ id: 'q-2', rule: 'malformed-reference' }] });
    });
});
