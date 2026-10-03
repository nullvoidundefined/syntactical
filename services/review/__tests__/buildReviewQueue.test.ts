import type { CachedBank, Question } from '@syntactical/content-schema';
import type { AnswerEvent } from '@syntactical/progress';

import { buildReviewQueue } from '../buildReviewQueue';
import { readMisconception } from '../readMisconception';

const provenance = { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } } as const;
const query = { explanation: 'e', title: 't' };

function mc(id: string, misconceptionId?: string): Question {
  return {
    answerIndex: 0,
    choices: [{ text: 'right' }, { misconceptionId, text: 'wrong' }],
    id,
    prompt: id,
    provenance,
    query,
    type: 'mc',
  };
}

const BANKS: Record<string, CachedBank> = {
  'python/easy': { hash: 'a'.repeat(64), questions: [mc('py-easy-01', 'python.mutable-default-args'), mc('py-easy-02'), mc('py-easy-03')] },
};

function readLocalBank(language: string, difficulty: string): CachedBank | null {
  return BANKS[`${language}/${difficulty}`] ?? null;
}

function miss(questionId: string, answeredAt: string, bankKey = 'python/easy'): AnswerEvent {
  return { answeredAt, bankKey, choiceIndex: 1, eventId: `${questionId}-${answeredAt}`, isCorrect: false, questionId, roundKind: 'bank' };
}

describe('buildReviewQueue', () => {
  it('lists every question due now, most overdue first', () => {
    const events = [miss('py-easy-02', '2026-09-20T10:00:00Z'), miss('py-easy-01', '2026-09-19T10:00:00Z'), miss('py-easy-03', '2026-09-21T10:00:00Z')];
    const { dueQuestions, nextDueAt } = buildReviewQueue(events, readLocalBank, new Date('2026-10-01T00:00:00Z'));
    expect(dueQuestions.map(({ question }) => question.id)).toEqual(['py-easy-01', 'py-easy-02', 'py-easy-03']);
    expect(dueQuestions[0]).toMatchObject({ difficulty: 'easy', language: 'python' });
    expect(nextDueAt).toBeNull();
  });

  it('skips a due question from a bank with no local copy, such as an uncached paid bank', () => {
    const events = [miss('py-easy-01', '2026-09-20T10:00:00Z'), miss('py-medium-04', '2026-09-20T10:00:00Z', 'python/medium')];
    const { dueQuestions } = buildReviewQueue(events, readLocalBank, new Date('2026-10-01T00:00:00Z'));
    expect(dueQuestions.map(({ question }) => question.id)).toEqual(['py-easy-01']);
  });

  it('reports nothing due and the next due time before any item comes due', () => {
    const events = [miss('py-easy-01', '2026-09-20T10:00:00Z')];
    const { dueQuestions, nextDueAt, reviewState } = buildReviewQueue(events, readLocalBank, new Date('2026-09-20T10:00:01Z'));
    expect(dueQuestions).toEqual([]);
    expect(nextDueAt).toBe(reviewState.questions['py-easy-01'].card.due.toISOString());
    expect(Date.parse(nextDueAt ?? '')).toBeGreaterThan(Date.parse('2026-09-20T10:00:01Z'));
  });

  it('is empty with no answer events', () => {
    expect(buildReviewQueue([], readLocalBank, new Date())).toMatchObject({ dueQuestions: [], nextDueAt: null });
  });

  it('tracks the misconception a tagged wrong choice reveals', () => {
    const { reviewState } = buildReviewQueue([miss('py-easy-01', '2026-09-20T10:00:00Z')], readLocalBank, new Date('2026-10-01T00:00:00Z'));
    expect(Object.keys(reviewState.misconceptions)).toEqual(['python.mutable-default-args']);
  });
});

describe('readMisconception', () => {
  const boolQuestion: Question = { answer: true, id: 'b-1', misconceptionId: 'python.truthy', prompt: 'p', provenance, query, type: 'bool' };
  const index = new Map([
    ['b-1', { difficulty: 'easy', language: 'python', question: boolQuestion }],
    ['py-easy-01', { difficulty: 'easy', language: 'python', question: mc('py-easy-01', 'python.mutable-default-args') }],
  ]);

  it('reads the chosen wrong choice tag, never the correct choice', () => {
    expect(readMisconception(index, 'py-easy-01', 1)).toBe('python.mutable-default-args');
    expect(readMisconception(index, 'py-easy-01', 0)).toBeUndefined();
  });

  it('reads a true/false question tag only for the wrong value (index 1 is False)', () => {
    expect(readMisconception(index, 'b-1', 1)).toBe('python.truthy');
    expect(readMisconception(index, 'b-1', 0)).toBeUndefined();
  });

  it('is undefined for an unknown question', () => {
    expect(readMisconception(index, 'nope', 1)).toBeUndefined();
  });
});
