// Regression pins that already hold (B-4, B-4b): which single rule the client
// validator reports when a question breaks several, that reference checks do
// not depend on the context's id order, and that the publish validator treats
// a non-string rationale as missing while valid enriched questions pass.
import { describe, expect, it } from 'vitest';

import { validateBankForPublish } from '../validateBankForPublish.js';
import { validateQuestionBank } from '../validateQuestionBank.js';
import type { BankContext } from '../types/BankContext.js';

type QuestionFixture = Record<string, unknown>;

const CONTEXT: BankContext = {
    topicIds: ['iterables', 'strings'],
    misconceptionIds: ['python.off-by-one', 'python.x'],
};

function buildProvenance(): QuestionFixture {
    return { source: 'original', validation: { method: 'executed', status: 'passed' }, isHumanReviewed: false };
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

function buildEnrichedMultipleChoiceQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return buildMultipleChoiceQuestion(id, {
        topic: 'iterables',
        choices: [
            { text: '1', rationale: 'Read len as the first item.', misconceptionId: 'python.x' },
            { text: '2', rationale: 'Counted from zero.', misconceptionId: 'python.off-by-one' },
            { text: '3' },
            { text: '4', rationale: 'Counted the brackets as an item.' },
        ],
        ...overrides,
    });
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

function buildBank(questions: unknown[]): Record<string, unknown> {
    return { schemaVersion: 2, questions };
}

function bankWithDrops(kept: unknown[], drops: { id: string; rule: string }[]): Record<string, unknown> {
    return {
        isValid: true,
        questions: kept,
        droppedQuestionIds: drops.map((drop) => drop.id),
        dropped: drops,
    };
}

function publish(questions: QuestionFixture[]): { problems: { id: string; rule: string }[] } {
    const bank = { questions } as unknown as Parameters<typeof validateBankForPublish>[0];
    return validateBankForPublish(bank, CONTEXT);
}

describe('validateQuestionBank rule order', () => {
    it('drops a question with an unknown topic and no provenance as missing-provenance', () => {
        const kept = buildMultipleChoiceQuestion('q-1');
        const broken = buildMultipleChoiceQuestion('q-2', { topic: 'dictionaries' });
        delete broken.provenance;
        const result = validateQuestionBank(buildBank([kept, broken]), CONTEXT);
        expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'missing-provenance' }]));
    });

    it('drops an mc question with an unknown misconceptionId and an out-of-range answerIndex as malformed question', () => {
        const kept = buildMultipleChoiceQuestion('q-1');
        const broken = buildMultipleChoiceQuestion('q-2', {
            choices: [{ text: '1', misconceptionId: 'python.not-in-taxonomy' }, { text: '2' }, { text: '3' }],
            answerIndex: 3,
        });
        const result = validateQuestionBank(buildBank([kept, broken]), CONTEXT);
        expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'malformed question' }]));
    });

    it('drops a question with an unknown topic and an unknown misconceptionId with exactly one rule, unknown-topic', () => {
        const kept = buildMultipleChoiceQuestion('q-1');
        const broken = buildMultipleChoiceQuestion('q-2', {
            topic: 'dictionaries',
            choices: [{ text: '1', misconceptionId: 'python.not-in-taxonomy' }, { text: '2' }, { text: '3' }],
        });
        const result = validateQuestionBank(buildBank([kept, broken]), CONTEXT);
        expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-topic' }]));
    });

    it('keeps a valid question when the context lists ids in a different order with extra entries', () => {
        const question = buildMultipleChoiceQuestion('q-1', {
            topic: 'iterables',
            choices: [{ text: '1', misconceptionId: 'python.x' }, { text: '2' }, { text: '3' }],
        });
        const reordered: BankContext = {
            topicIds: ['strings', 'dictionaries', 'iterables', 'loops'],
            misconceptionIds: ['python.y', 'python.x', 'python.off-by-one'],
        };
        const result = validateQuestionBank(buildBank([question]), reordered);
        expect(result).toEqual(bankWithDrops([question], []));
    });
});

describe('validateBankForPublish non-string rationale and valid input (B-4b)', () => {
    const NON_STRING_VALUES: [string, unknown][] = [
        ['a number', 42],
        ['null', null],
        ['an object', { text: 'Counted from zero.' }],
        ['an array', ['Counted from zero.']],
    ];

    it.each(NON_STRING_VALUES)('reports missing-rationale for a wrong mc choice whose rationale is %s', (_label, value) => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', {
            choices: [{ text: '1', rationale: value }, { text: '2', rationale: 'Counted from zero.' }, { text: '3' }],
        });
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
    });

    it.each(NON_STRING_VALUES)('reports missing-rationale for a bool question whose rationale is %s', (_label, value) => {
        const question = buildEnrichedBooleanQuestion('q-1', { rationale: value });
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
    });

    it('reports no problems for valid enriched mc and bool questions', () => {
        const questions = [buildEnrichedMultipleChoiceQuestion('q-1'), buildEnrichedBooleanQuestion('q-2')];
        expect(publish(questions)).toEqual({ problems: [] });
    });
});
