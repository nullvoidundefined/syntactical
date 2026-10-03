// Regression pins for how publish problems combine on one question: a
// malformed reference is reported once per question, and never hides a
// validation refusal or a problem on a sibling choice.
import { describe, expect, it } from 'vitest';

import type { Question } from '../types/Question.js';
import { validateBankForPublish } from '../validateBankForPublish.js';

const CONTEXT = { topicIds: ['iterables'], misconceptionIds: ['python.x'] };

function mcQuestion(overrides: Record<string, unknown> = {}): Question {
  return {
    id: 'q-1',
    type: 'mc',
    topic: 'iterables',
    prompt: 'What does `len([1, 2, 3])` return?',
    choices: [
      { text: '1', rationale: 'Read len as the first item.', misconceptionId: 'python.x' },
      { text: '3' },
      { text: '4', rationale: 'Counted the brackets as an item.' },
    ],
    answerIndex: 1,
    query: { title: 'len()', explanation: 'len counts the items.' },
    provenance: { source: 'original', validation: { method: 'executed', status: 'passed' }, isHumanReviewed: false },
    ...overrides,
  } as unknown as Question;
}

function publish(question: Question) {
  return validateBankForPublish({ questions: [question] }, CONTEXT).problems.map(({ rule }) => rule).sort();
}

describe('validateBankForPublish problem combinations', () => {
  it('reports one malformed-reference for a malformed topic and a malformed choice misconceptionId together', () => {
    const question = mcQuestion({
      topic: 42,
      choices: [
        { text: '1', rationale: 'r', misconceptionId: null },
        { text: '3' },
        { text: '4', rationale: 'r', misconceptionId: 7 },
      ],
    });
    expect(publish(question)).toEqual(['malformed-reference']);
  });

  it('keeps a validation refusal beside a malformed reference', () => {
    const question = mcQuestion({
      topic: null,
      provenance: { source: 'original', validation: { method: 'executed', status: 'failed' }, isHumanReviewed: true },
    });
    expect(publish(question)).toEqual(['malformed-reference', 'validation-failed']);
  });

  it('reports a malformed id on one choice and an unknown id on another', () => {
    const question = mcQuestion({
      choices: [
        { text: '1', rationale: 'r', misconceptionId: { id: 'python.x' } },
        { text: '3' },
        { text: '4', rationale: 'r', misconceptionId: 'python.not-listed' },
      ],
    });
    expect(publish(question)).toEqual(['malformed-reference', 'unknown-misconception']);
  });

  it('reports a malformed id and a missing rationale on the same wrong choice', () => {
    const question = mcQuestion({
      choices: [
        { text: '1', misconceptionId: 42 },
        { text: '3' },
        { text: '4', rationale: 'r' },
      ],
    });
    expect(publish(question)).toEqual(['malformed-reference', 'missing-rationale']);
  });
});
