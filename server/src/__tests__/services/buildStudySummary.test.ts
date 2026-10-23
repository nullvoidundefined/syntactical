// The study note's summary: totals and per-bank counts, review answers, and the misconceptions
// wrong choices revealed most, with their manifest descriptions.
import type { Question } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { buildStudySummary } from '../../services/buildStudySummary.js';
import type { StudyNoteEvent } from '../../types/StudyNoteEvent.js';

const PROVENANCE: Question['provenance'] = {
  isHumanReviewed: true,
  source: 'original',
  validation: { method: 'judged', status: 'passed' },
};
const base = { provenance: PROVENANCE, query: { explanation: 'e', title: 't' } };
const mc: Question = {
  ...base,
  answerIndex: 0,
  choices: [{ text: 'right' }, { misconceptionId: 'python.a', text: 'a' }, { misconceptionId: 'python.b', text: 'b' }],
  id: 'mc',
  prompt: 'p',
  type: 'mc',
};
const bool: Question = { ...base, answer: true, id: 'bool', misconceptionId: 'python.c', prompt: 'p', type: 'bool' };
const questions = new Map([
  [
    'python/easy',
    new Map<string, Question>([
      [mc.id, mc],
      [bool.id, bool],
    ]),
  ],
]);
const labels = {
  languages: new Map([['python', 'Python']]),
  misconceptions: new Map([
    ['python.a', 'A'],
    ['python.b', 'B'],
    ['python.c', 'C'],
  ]),
};

function event(questionId: string, choiceIndex: number, isCorrect: boolean, extra: Partial<StudyNoteEvent> = {}) {
  return { bankKey: 'python/easy', choiceIndex, isCorrect, questionId, roundKind: 'bank' as const, ...extra };
}

describe('buildStudySummary', () => {
  it('counts answers per bank, review answers, and the most revealed misconceptions', () => {
    const summary = buildStudySummary(
      [
        event('mc', 0, true),
        event('mc', 1, false),
        event('mc', 1, false),
        event('mc', 2, false, { roundKind: 'review' }),
        event('bool', 1, false),
        event('gone', 0, false, { bankKey: 'go/hard' }),
      ],
      questions,
      labels,
    );

    expect(summary).toEqual({
      answers: 6,
      banks: [
        { answers: 5, correct: 1, label: 'Python · Easy' },
        { answers: 1, correct: 0, label: 'go · Hard' },
      ],
      correct: 1,
      missedMisconceptions: [
        { description: 'A', misses: 2 },
        { description: 'B', misses: 1 },
        { description: 'C', misses: 1 },
      ],
      reviewAnswers: 1,
    });
  });

  it('names no misconception for a correct answer or a choice that reveals none', () => {
    const summary = buildStudySummary([event('mc', 0, true), event('bool', 0, true)], questions, labels);

    expect(summary.missedMisconceptions).toEqual([]);
  });
});
