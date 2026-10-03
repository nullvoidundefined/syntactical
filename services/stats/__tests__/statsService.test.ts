import { createEmptyStats } from '../createEmptyStats';
import { recordAnswer } from '../recordAnswer';
import { recordCompletion } from '../recordCompletion';

const python = { language: 'python', difficulty: 'easy' };

describe('statsService', () => {
  it('counts a correct answer, extends the streak, and raises the best streak', () => {
    const stats = recordAnswer(createEmptyStats('2026-10-03'), { ...python, wasCorrect: true });
    expect(stats.totals).toEqual({ attempted: 1, correct: 1 });
    expect(stats.answerStreak).toEqual({ current: 1, best: 1 });
    expect(stats.tracks['python:easy']).toEqual({ attempted: 1, correct: 1, completions: 0 });
  });

  it('resets the current streak on an incorrect answer and keeps the best', () => {
    let stats = createEmptyStats('2026-10-03');
    stats = recordAnswer(stats, { ...python, wasCorrect: true });
    stats = recordAnswer(stats, { ...python, wasCorrect: true });
    stats = recordAnswer(stats, { ...python, wasCorrect: false });
    expect(stats.answerStreak).toEqual({ current: 0, best: 2 });
    expect(stats.totals).toEqual({ attempted: 3, correct: 2 });
  });

  it('keeps per-language and per-difficulty counts separate', () => {
    let stats = createEmptyStats('2026-10-03');
    stats = recordAnswer(stats, { ...python, wasCorrect: true });
    stats = recordAnswer(stats, { language: 'postgres', difficulty: 'hard', wasCorrect: false });
    expect(stats.tracks['python:easy']).toEqual({ attempted: 1, correct: 1, completions: 0 });
    expect(stats.tracks['postgres:hard']).toEqual({ attempted: 1, correct: 0, completions: 0 });
  });

  it('records exactly one completion per call', () => {
    const stats = recordCompletion(createEmptyStats('2026-10-03'), python);
    expect(stats.tracks['python:easy'].completions).toBe(1);
  });
});
