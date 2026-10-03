// B-3b: the publish validator's hardening. Over-long rationales, whitespace-only
// topics and rationales, and questions whose validation failed or is pending
// without human review are all publish problems (B-22).
import { describe, expect, it } from 'vitest';

import { validateBankForPublish } from '../validateBankForPublish.js';

type QuestionFixture = Record<string, unknown>;

const CONTEXT = { topicIds: ['iterables', 'strings'], misconceptionIds: ['python.off-by-one', 'python.x'] };
const MAX_RATIONALE_LENGTH = 280;

function buildProvenance(overrides: QuestionFixture = {}): QuestionFixture {
    return {
        source: 'original',
        validation: { method: 'executed', status: 'passed' },
        isHumanReviewed: false,
        ...overrides,
    };
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

function publish(questions: QuestionFixture[]): { problems: { id: string; rule: string }[] } {
    const bank = { questions } as unknown as Parameters<typeof validateBankForPublish>[0];
    return validateBankForPublish(bank, CONTEXT);
}

describe('validateBankForPublish hardening (B-3b)', () => {
    describe('rationale length', () => {
        it('reports rationale-too-long for a wrong mc choice whose rationale is 281 characters', () => {
            const question = buildEnrichedMultipleChoiceQuestion('q-1', {
                choices: [
                    { text: '1', rationale: 'r'.repeat(MAX_RATIONALE_LENGTH + 1) },
                    { text: '3' },
                ],
                answerIndex: 1,
            });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'rationale-too-long' }] });
        });

        it('reports rationale-too-long for a bool question whose rationale is 281 characters', () => {
            const question = buildEnrichedBooleanQuestion('q-1', { rationale: 'r'.repeat(MAX_RATIONALE_LENGTH + 1) });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'rationale-too-long' }] });
        });
    });

    describe('whitespace-only text counts as missing', () => {
        it('reports missing-topic for an mc question whose topic is whitespace', () => {
            const question = buildEnrichedMultipleChoiceQuestion('q-1', { topic: '   ' });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-topic' }] });
        });

        it('reports missing-topic for a bool question whose topic is a tab and a newline', () => {
            const question = buildEnrichedBooleanQuestion('q-1', { topic: '\t\n' });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-topic' }] });
        });

        it('reports missing-rationale for a wrong mc choice whose rationale is whitespace', () => {
            const question = buildEnrichedMultipleChoiceQuestion('q-1', {
                choices: [{ text: '1', rationale: '  \n ' }, { text: '3' }],
                answerIndex: 1,
            });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
        });

        it('reports missing-rationale for a bool question whose rationale is whitespace', () => {
            const question = buildEnrichedBooleanQuestion('q-1', { rationale: '   ' });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
        });
    });

    describe('validation status', () => {
        it('reports validation-failed for an enriched mc question whose validation failed', () => {
            const question = buildEnrichedMultipleChoiceQuestion('q-1', {
                provenance: buildProvenance({ validation: { method: 'executed', status: 'failed' } }),
            });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'validation-failed' }] });
        });

        it('reports validation-failed for an enriched bool question whose validation failed even when human-reviewed', () => {
            const question = buildEnrichedBooleanQuestion('q-1', {
                provenance: buildProvenance({
                    validation: { method: 'judged', status: 'failed' },
                    isHumanReviewed: true,
                }),
            });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'validation-failed' }] });
        });

        it('reports validation-pending for an enriched mc question pending validation and not human-reviewed', () => {
            const question = buildEnrichedMultipleChoiceQuestion('q-1', {
                provenance: buildProvenance({ validation: { method: 'judged', status: 'pending' } }),
            });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'validation-pending' }] });
        });

        it('reports validation-pending for an enriched bool question pending validation and not human-reviewed', () => {
            const question = buildEnrichedBooleanQuestion('q-1', {
                provenance: buildProvenance({ validation: { method: 'executed', status: 'pending' } }),
            });
            expect(publish([question])).toEqual({ problems: [{ id: 'q-1', rule: 'validation-pending' }] });
        });

        it('reports only the failing questions in a bank mixing passed, reviewed, failed, and pending', () => {
            const questions = [
                buildEnrichedMultipleChoiceQuestion('q-1'),
                buildEnrichedBooleanQuestion('q-2', {
                    provenance: buildProvenance({ validation: { method: 'judged', status: 'pending' }, isHumanReviewed: true }),
                }),
                buildEnrichedMultipleChoiceQuestion('q-3', {
                    provenance: buildProvenance({ validation: { method: 'executed', status: 'failed' } }),
                }),
                buildEnrichedBooleanQuestion('q-4', {
                    provenance: buildProvenance({ validation: { method: 'judged', status: 'pending' } }),
                }),
            ];
            const { problems } = publish(questions);
            expect(problems).toHaveLength(2);
            expect(problems).toEqual(
                expect.arrayContaining([
                    { id: 'q-3', rule: 'validation-failed' },
                    { id: 'q-4', rule: 'validation-pending' },
                ]),
            );
        });
    });
});
