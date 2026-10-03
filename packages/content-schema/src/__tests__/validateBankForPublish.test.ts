import { describe, expect, it } from 'vitest';

import { validateBankForPublish } from '../validateBankForPublish.js';

type QuestionFixture = Record<string, unknown>;

const CONTEXT = { topicIds: ['iterables', 'strings'], misconceptionIds: ['python.off-by-one', 'python.x'] };

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
        query: { title: 'List mutability', explanation: 'Lists can be changed in place.' },
        provenance: buildProvenance(),
        ...overrides,
    };
}

function withoutField(question: QuestionFixture, field: string): QuestionFixture {
    const copy = { ...question };
    delete copy[field];
    return copy;
}

function publish(questions: QuestionFixture[]): { problems: { id: string; rule: string }[] } {
    const bank = { questions } as unknown as Parameters<typeof validateBankForPublish>[0];
    return validateBankForPublish(bank, CONTEXT);
}

describe('validateBankForPublish', () => {
    it('reports no problems for a fully enriched mc question', () => {
        expect(publish([buildEnrichedMultipleChoiceQuestion('q-1')])).toEqual({ problems: [] });
    });

    it('reports no problems for a fully enriched bool question', () => {
        expect(publish([buildEnrichedBooleanQuestion('q-1')])).toEqual({ problems: [] });
    });

    it('reports no problems for a bool question with a rationale and no misconceptionId', () => {
        const question = withoutField(buildEnrichedBooleanQuestion('q-1'), 'misconceptionId');
        expect(publish([question])).toEqual({ problems: [] });
    });

    it('reports no problems for a wrong choice and a bool question with 280-character rationales', () => {
        const questions = [
            buildEnrichedMultipleChoiceQuestion('q-1', {
                choices: [{ text: '1', rationale: 'r'.repeat(280) }, { text: '3' }],
                answerIndex: 1,
            }),
            buildEnrichedBooleanQuestion('q-2', { rationale: 'r'.repeat(280) }),
        ];
        expect(publish(questions)).toEqual({ problems: [] });
    });

    it('reports no problems for a question pending validation that a human reviewed', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', {
            provenance: {
                source: 'generated',
                validation: { method: 'judged', status: 'pending' },
                isHumanReviewed: true,
            },
        });
        expect(publish([question])).toEqual({ problems: [] });
    });

    it('reports missing-topic for an mc question with no topic', () => {
        const question = withoutField(buildEnrichedMultipleChoiceQuestion('q-1'), 'topic');
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-topic' }] });
    });

    it('reports missing-topic for a bool question with no topic', () => {
        const question = withoutField(buildEnrichedBooleanQuestion('q-1'), 'topic');
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-topic' }] });
    });

    it('reports one missing-rationale for a single wrong choice lacking a rationale', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', {
            choices: [{ text: '1', rationale: 'Read len as the first item.' }, { text: '2' }, { text: '3' }],
            answerIndex: 2,
        });
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
    });

    it('reports one missing-rationale per wrong choice lacking a rationale', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', {
            choices: [{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }],
            answerIndex: 2,
        });
        expect(publish([question])).toEqual({
            problems: [
                { id: 'q-1', rule: 'missing-rationale' },
                { id: 'q-1', rule: 'missing-rationale' },
                { id: 'q-1', rule: 'missing-rationale' },
            ],
        });
    });

    it('counts an empty rationale on a wrong choice as missing', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', {
            choices: [{ text: '1', rationale: '' }, { text: '2', rationale: 'Counted from zero.' }],
            answerIndex: 1,
        });
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
    });

    it('does not require a rationale on the correct choice', () => {
        const question = buildEnrichedMultipleChoiceQuestion('q-1', {
            choices: [{ text: '1', rationale: 'Read len as the first item.' }, { text: '3' }],
            answerIndex: 1,
        });
        expect(publish([question])).toEqual({ problems: [] });
    });

    it('reports missing-rationale for a bool question with no rationale', () => {
        const question = withoutField(buildEnrichedBooleanQuestion('q-1'), 'rationale');
        expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
    });

    it('reports both missing-topic and missing-rationale on the same question', () => {
        const question = withoutField(
            buildEnrichedMultipleChoiceQuestion('q-1', { choices: [{ text: '1' }, { text: '3' }], answerIndex: 1 }),
            'topic',
        );
        const { problems } = publish([question]);
        expect(problems).toHaveLength(2);
        expect(problems).toEqual(
            expect.arrayContaining([
                { id: 'q-1', rule: 'missing-topic' },
                { id: 'q-1', rule: 'missing-rationale' },
            ]),
        );
    });

    it('reports problems for each failing question and none for the enriched ones', () => {
        const questions = [
            buildEnrichedMultipleChoiceQuestion('q-1'),
            withoutField(buildEnrichedMultipleChoiceQuestion('q-2'), 'topic'),
            buildEnrichedBooleanQuestion('q-3'),
            withoutField(buildEnrichedBooleanQuestion('q-4'), 'rationale'),
        ];
        const { problems } = publish(questions);
        expect(problems).toHaveLength(2);
        expect(problems).toEqual(
            expect.arrayContaining([
                { id: 'q-2', rule: 'missing-topic' },
                { id: 'q-4', rule: 'missing-rationale' },
            ]),
        );
    });
});
