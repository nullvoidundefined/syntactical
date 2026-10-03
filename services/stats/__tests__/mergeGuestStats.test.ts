// PR #33 review round 2, fix 4 (Task 3.11, B-36): pins the rule that folds a
// guest's stats into the stats of the user who claims them.
import type { Stats } from '../types/Stats';
import { mergeGuestStats } from '../mergeGuestStats';

function buildStats(overrides: Partial<Stats> = {}): Stats {
  return {
    answerStreak: { best: 0, current: 0 },
    goalHistory: [{ from: '2026-09-01', goal: 20 }],
    isSignUpPromptDismissed: false,
    totals: { attempted: 0, correct: 0 },
    tracks: {},
    version: 2,
    ...overrides,
  };
}

describe('mergeGuestStats', () => {
  it('adds the totals', () => {
    const merged = mergeGuestStats(buildStats({ totals: { attempted: 9, correct: 7 } }), buildStats({ totals: { attempted: 4, correct: 3 } }));
    expect(merged.totals).toEqual({ attempted: 13, correct: 10 });
  });

  it('adds attempted, correct, and completions per track and keeps tracks only one side has', () => {
    const guest = buildStats({
      tracks: {
        'python:easy': { attempted: 9, completions: 3, correct: 7 },
        'sql:medium': { attempted: 2, completions: 0, correct: 1 },
      },
    });
    const user = buildStats({
      tracks: {
        'postgres:hard': { attempted: 5, completions: 2, correct: 4 },
        'python:easy': { attempted: 4, completions: 1, correct: 3 },
      },
    });
    expect(mergeGuestStats(guest, user).tracks).toEqual({
      'postgres:hard': { attempted: 5, completions: 2, correct: 4 },
      'python:easy': { attempted: 13, completions: 4, correct: 10 },
      'sql:medium': { attempted: 2, completions: 0, correct: 1 },
    });
  });

  it.each([
    { expected: { best: 10, current: 3 }, guest: { best: 10, current: 2 }, label: 'the guest best is largest', user: { best: 4, current: 1 } },
    { expected: { best: 12, current: 3 }, guest: { best: 5, current: 2 }, label: 'the user best is largest', user: { best: 12, current: 1 } },
    { expected: { best: 9, current: 9 }, guest: { best: 5, current: 5 }, label: 'the merged current is largest', user: { best: 6, current: 4 } },
    { expected: { best: 7, current: 0 }, guest: { best: 7, current: 0 }, label: 'both currents are zero', user: { best: 2, current: 0 } },
  ])('adds the current answer streak and takes the largest best when $label', ({ expected, guest, user }) => {
    const merged = mergeGuestStats(buildStats({ answerStreak: guest }), buildStats({ answerStreak: user }));
    expect(merged.answerStreak).toEqual(expected);
  });

  it.each([
    { expected: false, guest: false, user: false },
    { expected: true, guest: true, user: false },
    { expected: true, guest: false, user: true },
    { expected: true, guest: true, user: true },
  ])('keeps the sign-up prompt dismissed when either dismissed it (guest $guest, user $user)', ({ expected, guest, user }) => {
    const merged = mergeGuestStats(buildStats({ isSignUpPromptDismissed: guest }), buildStats({ isSignUpPromptDismissed: user }));
    expect(merged.isSignUpPromptDismissed).toBe(expected);
  });

  const guestOneGoal = [{ from: '2026-09-01', goal: 50 }];
  const guestTwoGoals = [
    { from: '2026-09-01', goal: 20 },
    { from: '2026-09-05', goal: 50 },
  ];
  const userOneGoal = [{ from: '2026-09-10', goal: 20 }];
  const userTwoGoals = [
    { from: '2026-09-10', goal: 20 },
    { from: '2026-09-12', goal: 10 },
  ];

  it.each([
    { expected: guestOneGoal, guest: guestOneGoal, label: 'the guest\'s when the user has one entry', user: userOneGoal },
    { expected: guestTwoGoals, guest: guestTwoGoals, label: 'the guest\'s when the user has one entry and the guest several', user: userOneGoal },
    { expected: userTwoGoals, guest: guestOneGoal, label: 'the user\'s when the user has more than one entry', user: userTwoGoals },
    { expected: userTwoGoals, guest: guestTwoGoals, label: 'the user\'s when both have more than one entry', user: userTwoGoals },
  ])('keeps goal history: $label', ({ expected, guest, user }) => {
    const merged = mergeGuestStats(buildStats({ goalHistory: guest }), buildStats({ goalHistory: user }));
    expect(merged.goalHistory).toEqual(expected);
  });

  it('keeps the user\'s sync cursor and its owner, never the guest\'s', () => {
    const guest = buildStats({ syncCursor: 'cursor-guest', syncCursorOwner: 'owner-guest' });
    const user = buildStats({ syncCursor: 'cursor-user', syncCursorOwner: 'owner-user' });
    const merged = mergeGuestStats(guest, user);
    expect(merged.syncCursor).toBe('cursor-user');
    expect(merged.syncCursorOwner).toBe('owner-user');
  });

  it('adopts no cursor from the guest when the user has none', () => {
    const guest = buildStats({ syncCursor: 'cursor-guest', syncCursorOwner: 'owner-guest' });
    const merged = mergeGuestStats(guest, buildStats());
    expect(merged.syncCursor).toBeUndefined();
    expect(merged.syncCursorOwner).toBeUndefined();
  });
});
