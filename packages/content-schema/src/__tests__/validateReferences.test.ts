// B-4: both validators reject a question whose topic is not in its language's
// manifest topic list, and one whose misconceptionId (on any mc choice, or on a
// bool question) is not in its language's misconception taxonomy. Matching is
// exact and case-sensitive.
import { describe, expect, it } from 'vitest';

import { validateBankForPublish } from '../validateBankForPublish.js';
import { validateQuestionBank } from '../validateQuestionBank.js';
import type { BankContext } from '../types/BankContext.js';

type QuestionFixture = Record<string, unknown>;

const CONTEXT: BankContext = {
    topicIds: ['iterables', 'strings'],
    misconceptionIds: ['python.off-by-one', 'python.x'],
};

const EMPTY_CONTEXT: BankContext = { topicIds: [], misconceptionIds: [] };

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

// Publish fixtures carry every enrichment the publish check requires, so the
// only problems reported are the reference problems under test.
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
    return buildBooleanQuestion(id, {
        topic: 'iterables',
        rationale: 'Tuples are the immutable sequence, not lists.',
        misconceptionId: 'python.x',
        ...overrides,
    });
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

function publish(questions: QuestionFixture[], context: BankContext = CONTEXT): { problems: { id: string; rule: string }[] } {
    const bank = { questions } as unknown as Parameters<typeof validateBankForPublish>[0];
    return validateBankForPublish(bank, context);
}

describe('validateQuestionBank references (B-4)', () => {
    describe('topic', () => {
        it('keeps a question whose topic is listed and drops one whose topic is not, with unknown-topic', () => {
            const kept = buildMultipleChoiceQuestion('q-1', { topic: 'strings' });
            const unknown = buildMultipleChoiceQuestion('q-2', { topic: 'dictionaries' });
            const result = validateQuestionBank(buildBank([kept, unknown]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-topic' }]));
        });

        it('drops a bool question whose topic is not listed, with unknown-topic', () => {
            const kept = buildBooleanQuestion('q-1', { topic: 'iterables' });
            const unknown = buildBooleanQuestion('q-2', { topic: 'dictionaries' });
            const result = validateQuestionBank(buildBank([kept, unknown]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-topic' }]));
        });

        it('drops a question whose topic is listed only under a different case', () => {
            const kept = buildMultipleChoiceQuestion('q-1', { topic: 'strings' });
            const wrongCase = buildMultipleChoiceQuestion('q-2', { topic: 'Strings' });
            const result = validateQuestionBank(buildBank([kept, wrongCase]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-topic' }]));
        });

        it('drops a question whose topic is a prefix of a listed topic', () => {
            const kept = buildMultipleChoiceQuestion('q-1', { topic: 'strings' });
            const prefix = buildMultipleChoiceQuestion('q-2', { topic: 'string' });
            const result = validateQuestionBank(buildBank([kept, prefix]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-topic' }]));
        });
    });

    describe('misconceptionId', () => {
        it('drops an mc question with one unlisted choice misconceptionId, with unknown-misconception', () => {
            const kept = buildMultipleChoiceQuestion('q-1', {
                choices: [{ text: '1', misconceptionId: 'python.x' }, { text: '2' }, { text: '3' }],
            });
            const unknown = buildMultipleChoiceQuestion('q-2', {
                choices: [
                    { text: '1', misconceptionId: 'python.x' },
                    { text: '2', misconceptionId: 'python.not-in-taxonomy' },
                    { text: '3' },
                ],
            });
            const result = validateQuestionBank(buildBank([kept, unknown]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-misconception' }]));
        });

        it('drops an mc question whose unlisted misconceptionId sits on the correct choice', () => {
            const kept = buildMultipleChoiceQuestion('q-1');
            const unknown = buildMultipleChoiceQuestion('q-2', {
                choices: [{ text: '1' }, { text: '2' }, { text: '3', misconceptionId: 'python.not-in-taxonomy' }],
                answerIndex: 2,
            });
            const result = validateQuestionBank(buildBank([kept, unknown]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-misconception' }]));
        });

        it('drops a bool question whose misconceptionId is not listed, with unknown-misconception', () => {
            const kept = buildBooleanQuestion('q-1', { misconceptionId: 'python.off-by-one' });
            const unknown = buildBooleanQuestion('q-2', { misconceptionId: 'python.not-in-taxonomy' });
            const result = validateQuestionBank(buildBank([kept, unknown]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-misconception' }]));
        });

        it('drops a question whose misconceptionId is listed only under a different case', () => {
            const kept = buildBooleanQuestion('q-1', { misconceptionId: 'python.x' });
            const wrongCase = buildBooleanQuestion('q-2', { misconceptionId: 'Python.X' });
            const result = validateQuestionBank(buildBank([kept, wrongCase]), CONTEXT);
            expect(result).toEqual(bankWithDrops([kept], [{ id: 'q-2', rule: 'unknown-misconception' }]));
        });
    });

    describe('with an empty context', () => {
        it('keeps a question with no topic and no misconception ids and drops ones that carry references', () => {
            const kept = buildMultipleChoiceQuestion('q-1');
            const withTopic = buildBooleanQuestion('q-2', { topic: 'iterables' });
            const withMisconception = buildBooleanQuestion('q-3', { misconceptionId: 'python.x' });
            const result = validateQuestionBank(buildBank([kept, withTopic, withMisconception]), EMPTY_CONTEXT);
            expect(result).toEqual(
                bankWithDrops(
                    [kept],
                    [
                        { id: 'q-2', rule: 'unknown-topic' },
                        { id: 'q-3', rule: 'unknown-misconception' },
                    ],
                ),
            );
        });
    });

    it('keeps the rest of the bank in order around a question dropped for a reference', () => {
        const first = buildMultipleChoiceQuestion('q-1', { topic: 'iterables' });
        const unknown = buildBooleanQuestion('q-2', { topic: 'dictionaries' });
        const last = buildBooleanQuestion('q-3', { topic: 'strings', misconceptionId: 'python.x' });
        const result = validateQuestionBank(buildBank([first, unknown, last]), CONTEXT);
        expect(result).toEqual(bankWithDrops([first, last], [{ id: 'q-2', rule: 'unknown-topic' }]));
    });

    it('rejects the bank as having no valid questions when every question references an unknown id', () => {
        const unknownTopic = buildMultipleChoiceQuestion('q-1', { topic: 'dictionaries' });
        const unknownMisconception = buildBooleanQuestion('q-2', { misconceptionId: 'python.not-in-taxonomy' });
        const result = validateQuestionBank(buildBank([unknownTopic, unknownMisconception]), CONTEXT);
        expect(result).toEqual({ isValid: false, rule: 'no valid questions' });
    });
});

describe('validateBankForPublish references (B-4)', () => {
    it('reports unknown-topic for an mc question whose topic is not listed, and nothing for a listed one', () => {
        const questions = [
            buildEnrichedMultipleChoiceQuestion('q-1', { topic: 'strings' }),
            buildEnrichedMultipleChoiceQuestion('q-2', { topic: 'dictionaries' }),
        ];
        expect(publish(questions)).toEqual({ problems: [{ id: 'q-2', rule: 'unknown-topic' }] });
    });

    it('reports unknown-topic for a bool question whose topic is not listed', () => {
        const question = buildEnrichedBooleanQuestion('q-1', { topic: 'dictionaries' });
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'unknown-topic' }] });
    });

    it('reports unknown-topic for a topic listed only under a different case', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', { topic: 'Strings' });
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'unknown-topic' }] });
    });

    it('reports missing-topic and not unknown-topic for a question with no topic', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1');
        delete question.topic;
        const unknown = buildEnrichedBooleanQuestion('q-2', { topic: 'dictionaries' });
        expect(publish([question, unknown])).toEqual({
            problems: [
                { id: 'q-1', rule: 'missing-topic' },
                { id: 'q-2', rule: 'unknown-topic' },
            ],
        });
    });

    it('reports one unknown-misconception per offending choice', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', {
            choices: [
                { text: '1', rationale: 'Read len as the first item.', misconceptionId: 'python.not-in-taxonomy' },
                { text: '2', rationale: 'Counted from zero.', misconceptionId: 'python.off-by-one' },
                { text: '3' },
                { text: '4', rationale: 'Counted the brackets.', misconceptionId: 'python.also-missing' },
            ],
        });
        expect(publish([question])).toEqual({
            problems: [
                { id: 'q-1', rule: 'unknown-misconception' },
                { id: 'q-1', rule: 'unknown-misconception' },
            ],
        });
    });

    it('reports unknown-misconception for an unlisted id on the correct choice', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', {
            choices: [
                { text: '1', rationale: 'Read len as the first item.' },
                { text: '2', rationale: 'Counted from zero.' },
                { text: '3', misconceptionId: 'python.not-in-taxonomy' },
            ],
            answerIndex: 2,
        });
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'unknown-misconception' }] });
    });

    it('reports unknown-misconception for a bool question whose misconceptionId is not listed', () => {
        const questions = [
            buildEnrichedBooleanQuestion('q-1'),
            buildEnrichedBooleanQuestion('q-2', { misconceptionId: 'python.not-in-taxonomy' }),
        ];
        expect(publish(questions)).toEqual({ problems: [{ id: 'q-2', rule: 'unknown-misconception' }] });
    });

    it('reports unknown-misconception for a misconceptionId listed only under a different case', () => {
        const question = buildEnrichedBooleanQuestion('q-1', { misconceptionId: 'Python.X' });
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'unknown-misconception' }] });
    });

    it('reports both rules for a question with an unlisted topic and an unlisted misconceptionId', () => {
        const question = buildEnrichedBooleanQuestion('q-1', {
            topic: 'dictionaries',
            misconceptionId: 'python.not-in-taxonomy',
        });
        const { problems } = publish([question]);
        expect(problems).toHaveLength(2);
        expect(problems).toEqual(
            expect.arrayContaining([
                { id: 'q-1', rule: 'unknown-topic' },
                { id: 'q-1', rule: 'unknown-misconception' },
            ]),
        );
    });

    it('reports references against the context it is given, not a built-in list', () => {
        const question = buildEnrichedBooleanQuestion('q-1');
        const { problems } = publish([question], EMPTY_CONTEXT);
        expect(problems).toHaveLength(2);
        expect(problems).toEqual(
            expect.arrayContaining([
                { id: 'q-1', rule: 'unknown-topic' },
                { id: 'q-1', rule: 'unknown-misconception' },
            ]),
        );
    });
});
