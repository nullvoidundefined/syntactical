import type { Question } from '@syntactical/content-schema';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import type { ReviewQuestion } from '../../review/types/ReviewQuestion';
import { buildWeaknessReport } from '../buildWeaknessReport';

const NOW = new Date('2026-10-03T12:00:00Z');
const HOUR_MS = 3_600_000;
const provenance = { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } } as const;

// Each question: choice 0 is right, choice 1 reveals the named misconception.
function mc(id: string, misconceptionId: string): ReviewQuestion {
  const question: Question = {
    answerIndex: 0,
    choices: [{ text: 'right' }, { misconceptionId, text: 'wrong' }, { text: 'untagged' }],
    id,
    prompt: id,
    provenance,
    query: { explanation: 'e', title: 't' },
    type: 'mc',
  };
  return { difficulty: 'easy', language: 'python', question };
}

const index = new Map(
  [mc('q-a', 'python.a'), mc('q-b', 'python.b'), mc('q-c', 'python.c'), mc('q-d', 'python.d'), mc('q-e', 'python.e'), mc('q-f', 'python.f')].map(
    (entry) => [entry.question.id, entry] as const,
  ),
);

const descriptions = new Map([
  ['python.a', 'Mutable default arguments are shared'],
  ['python.b', 'is compares identity, not equality'],
  ['python.c', 'int() rounds toward zero'],
  ['python.d', 'Floats are exact'],
]);

let sequence = 0;
function answer(questionId: string, choiceIndex: number, hoursAgo = 1, isSynced = false): LoggedAnswerEvent {
  sequence += 1;
  return {
    answeredAt: new Date(NOW.getTime() - hoursAgo * HOUR_MS).toISOString(),
    bankKey: 'python/easy',
    choiceIndex,
    eventId: `event-${sequence}`,
    isCorrect: choiceIndex === 0,
    isHeld: false,
    isSynced,
    ownerUserId: null,
    questionId,
    roundKind: 'bank',
  };
}

function repeat(count: number, build: () => LoggedAnswerEvent): LoggedAnswerEvent[] {
  return Array.from({ length: count }, build);
}

describe('buildWeaknessReport', () => {
  it('asks for more answers below 20 in the last 7 days, counting only that window', () => {
    const events = [...repeat(15, () => answer('q-a', 1)), ...repeat(30, () => answer('q-a', 1, 8 * 24))];
    expect(buildWeaknessReport(events, index, descriptions, NOW)).toEqual({ remaining: 5, spots: [], status: 'gathering' });
  });

  it('ranks the top 3 misconceptions by miss rate with their descriptions, among those with at least 3 attempts', () => {
    const events = [
      ...repeat(3, () => answer('q-a', 1)), // a: 3 of 3
      answer('q-b', 1), answer('q-b', 1), answer('q-b', 0), answer('q-b', 0), // b: 2 of 4
      answer('q-c', 1), answer('q-c', 0), answer('q-c', 0), // c: 1 of 3
      answer('q-d', 1), ...repeat(4, () => answer('q-d', 0)), // d: 1 of 5
      answer('q-e', 1), answer('q-e', 1), // e: 2 attempts only
      ...repeat(3, () => answer('q-f', 0)), // f: never missed; 20 answers in all
    ];
    const report = buildWeaknessReport(events, index, descriptions, NOW);
    expect(report).toEqual({
      remaining: 0,
      spots: [
        { attempts: 3, description: 'Mutable default arguments are shared', misconceptionId: 'python.a', misses: 3, missRate: 1 },
        { attempts: 4, description: 'is compares identity, not equality', misconceptionId: 'python.b', misses: 2, missRate: 0.5 },
        { attempts: 3, description: 'int() rounds toward zero', misconceptionId: 'python.c', misses: 1, missRate: 1 / 3 },
      ],
      status: 'ready',
    });
  });

  it('never lists a misconception with no misses, nor one missed only through an untagged choice', () => {
    const events = [...repeat(10, () => answer('q-f', 0)), ...repeat(10, () => answer('q-a', 2))];
    expect(buildWeaknessReport(events, index, descriptions, NOW)).toEqual({ remaining: 0, spots: [], status: 'ready' });
  });

  it('counts synced events, which stay in the local log', () => {
    const events = [...repeat(17, () => answer('q-a', 1, 1, true)), ...repeat(3, () => answer('q-f', 0))];
    const report = buildWeaknessReport(events, index, descriptions, NOW);
    expect(report).toMatchObject({ spots: [{ misconceptionId: 'python.a', misses: 17 }], status: 'ready' });
  });

  it('counts a repeated event once', () => {
    const events = repeat(10, () => answer('q-a', 1));
    expect(buildWeaknessReport([...events, ...events], index, descriptions, NOW)).toEqual({ remaining: 10, spots: [], status: 'gathering' });
  });

  it('falls back to the misconception id when the manifest has no description', () => {
    const events = repeat(20, () => answer('q-e', 1));
    expect(buildWeaknessReport(events, index, descriptions, NOW)).toMatchObject({ spots: [{ description: 'python.e' }] });
  });
});
