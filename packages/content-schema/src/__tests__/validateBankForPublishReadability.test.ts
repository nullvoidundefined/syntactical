// B-53: a readability A/B card is judged, never executed, so publish needs a recorded human approval.
import { describe, expect, it } from 'vitest';

import { validateBankForPublish } from '../validateBankForPublish.js';

const CONTEXT = { misconceptionIds: [], topicIds: ['iterables'] };

function buildAbQuestion(criterionType: string, isHumanReviewed: boolean): Record<string, unknown> {
    return {
        answerIndex: 0,
        choices: [
            { code: 'total = sum(xs)', text: 'sum' },
            { code: 'total = 0\nfor x in xs: total += x', rationale: 'Spells out what sum already does.', text: 'loop' },
        ],
        criterion: { evidence: 'Option A says what it does in one call.', statement: 'Easier to read', type: criterionType },
        id: 'q-ab',
        prompt: 'Which is easier to read?',
        // Only readability cards are judged; performance and correctness cards are executed.
        provenance: {
            isHumanReviewed,
            source: 'generated',
            validation: { method: criterionType === 'readability' ? 'judged' : 'executed', status: 'passed' },
        },
        query: { explanation: 'e', title: 't' },
        topic: 'iterables',
        type: 'ab',
    };
}

function publish(question: Record<string, unknown>): { id: string; rule: string }[] {
    const bank = { questions: [question] } as unknown as Parameters<typeof validateBankForPublish>[0];
    return validateBankForPublish(bank, CONTEXT).problems;
}

describe('validateBankForPublish readability gate', () => {
    it('refuses a readability A/B question without a human approval', () => {
        expect(publish(buildAbQuestion('readability', false))).toEqual([{ id: 'q-ab', rule: 'readability-unreviewed' }]);
    });

    it('accepts a readability A/B question a human approved', () => {
        expect(publish(buildAbQuestion('readability', true))).toEqual([]);
    });

    it.each(['performance', 'correctness'])('does not ask a %s A/B question for a human approval', (criterionType) => {
        expect(publish(buildAbQuestion(criterionType, false))).toEqual([]);
    });
});
