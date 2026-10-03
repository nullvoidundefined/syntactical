import { isStoredStats } from '../isStoredStats';
import { isStoredStatsV1 } from '../isStoredStatsV1';
import { migrateStatsV1 } from '../migrateStatsV1';
import type { StatsV1 } from '../types/StatsV1';

const storedV1: StatsV1 = {
  streak: { best: 7, current: 3 },
  totals: { attempted: 40, correct: 31 },
  tracks: {
    'postgres:hard': { attempted: 10, completions: 1, correct: 4 },
    'python:easy': { attempted: 30, completions: 3, correct: 27 },
  },
  version: 1,
};

describe('migrateStatsV1', () => {
  it('carries totals and tracks over unchanged and renames streak to answerStreak', () => {
    const migrated = migrateStatsV1(storedV1, '2026-10-03');
    expect(migrated.totals).toEqual({ attempted: 40, correct: 31 });
    expect(migrated.tracks).toEqual(storedV1.tracks);
    expect(migrated.answerStreak).toEqual({ best: 7, current: 3 });
    expect(migrated).not.toHaveProperty('streak');
  });

  it('starts the goal history at today with the regular daily goal and no dismissed prompt or sync cursor', () => {
    const migrated = migrateStatsV1(storedV1, '2026-10-03');
    expect(migrated.goalHistory).toEqual([{ from: '2026-10-03', goal: 20 }]);
    expect(migrated.isSignUpPromptDismissed).toBe(false);
    expect(migrated).not.toHaveProperty('syncCursor');
    expect(migrated.version).toBe(2);
  });

  it('produces a value the v2 check accepts and the v1 check refuses, so a rerun finds nothing to migrate', () => {
    const migrated = migrateStatsV1(storedV1, '2026-10-03');
    expect(isStoredStats(migrated)).toBe(true);
    expect(isStoredStatsV1(migrated)).toBe(false);
    expect(isStoredStats(JSON.parse(JSON.stringify(migrated)))).toBe(true);
  });

  it('does not share track objects with the stored v1 value', () => {
    const migrated = migrateStatsV1(storedV1, '2026-10-03');
    migrated.tracks['python:easy'].attempted = 99;
    expect(storedV1.tracks['python:easy'].attempted).toBe(30);
  });

  it('throws for a today that is not a calendar date rather than storing a broken goal history', () => {
    expect(() => migrateStatsV1(storedV1, 'not-a-date')).toThrow(RangeError);
  });
});

describe('isStoredStats (v2)', () => {
  const valid = migrateStatsV1(storedV1, '2026-10-03');

  it.each([
    ['a v1 value', storedV1],
    ['a missing goal history', { ...valid, goalHistory: undefined }],
    ['a goal outside the daily goals', { ...valid, goalHistory: [{ from: '2026-10-03', goal: 15 }] }],
    ['a goal history entry with a bad date', { ...valid, goalHistory: [{ from: 'yesterday', goal: 20 }] }],
    ['a non-boolean sign-up prompt flag', { ...valid, isSignUpPromptDismissed: 'no' }],
    ['a non-string sync cursor', { ...valid, syncCursor: 5 }],
    ['a negative answer streak', { ...valid, answerStreak: { best: 1, current: -1 } }],
  ])('refuses %s', (_label, value) => {
    expect(isStoredStats(value)).toBe(false);
  });

  it('accepts a string sync cursor', () => {
    expect(isStoredStats({ ...valid, syncCursor: 'cursor-1' })).toBe(true);
  });
});
