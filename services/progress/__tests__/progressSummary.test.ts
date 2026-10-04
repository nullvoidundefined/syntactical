// The header's progress summary (Task 3.12, B-35): computed on the device for
// a guest, and from the last /me profile plus unseen local XP when signed in.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { combineProfileSummary } from '../combineProfileSummary';
import { computeLocalProgressSummary } from '../computeLocalProgressSummary';
import { computeUnseenXpToday } from '../computeUnseenXpToday';
import { findGoalForDate } from '../findGoalForDate';
import { parseProfile } from '../parseProfile';
import { setGoalFromDate } from '../setGoalFromDate';

const TIMEZONE = 'UTC';
const TODAY = '2026-10-04';

// `count` correct medium answers (2 XP each) on a local date.
function answersOn(localDate: string, count: number, isCorrect = true): AnswerEvent[] {
  return Array.from({ length: count }, (_unused, index) => ({
    answeredAt: `${localDate}T10:${String(index).padStart(2, '0')}:00Z`,
    bankKey: 'python/medium',
    choiceIndex: 0,
    eventId: randomUUID(),
    isCorrect,
    questionId: `q-${localDate}-${index}`,
    roundKind: 'bank' as const,
  }));
}

function logged(events: AnswerEvent[], isSynced: boolean): LoggedAnswerEvent[] {
  return events.map((event) => ({ ...event, isHeld: false, isSynced, ownerUserId: 'user-1' }));
}

describe('computeLocalProgressSummary', () => {
  it('reads a 3-day streak and 12 of 20 XP today from three met days and a partial today', () => {
    const events = [...answersOn('2026-10-01', 10), ...answersOn('2026-10-02', 10), ...answersOn('2026-10-03', 10), ...answersOn(TODAY, 6)];
    const summary = computeLocalProgressSummary({ events, goalHistory: [{ from: '2026-09-01', goal: 20 }], timezone: TIMEZONE, today: TODAY });
    expect(summary).toEqual({ dailyGoal: 20, dayStreak: 3, xpToday: 12 });
  });

  it('applies a goal raised today only from today, so earlier met days stay met', () => {
    const events = [...answersOn('2026-10-03', 10), ...answersOn(TODAY, 6)];
    const goalHistory = [
      { from: '2026-09-01', goal: 20 },
      { from: TODAY, goal: 50 },
    ];
    expect(computeLocalProgressSummary({ events, goalHistory, timezone: TIMEZONE, today: TODAY })).toEqual({ dailyGoal: 50, dayStreak: 1, xpToday: 12 });
  });

  it('counts today in the streak once today meets the goal, and wrong answers earn nothing', () => {
    const events = [...answersOn('2026-10-03', 10), ...answersOn(TODAY, 5), ...answersOn(TODAY, 4, false)];
    const summary = computeLocalProgressSummary({ events, goalHistory: [{ from: '2026-09-01', goal: 10 }], timezone: TIMEZONE, today: TODAY });
    expect(summary).toEqual({ dailyGoal: 10, dayStreak: 2, xpToday: 10 });
  });

  it('uses the default goal of 20 when the history is empty', () => {
    expect(computeLocalProgressSummary({ events: [], goalHistory: [], timezone: TIMEZONE, today: TODAY })).toEqual({ dailyGoal: 20, dayStreak: 0, xpToday: 0 });
  });
});

describe('computeUnseenXpToday', () => {
  it('sums only today events the profile has not counted', () => {
    const seen = logged(answersOn(TODAY, 3), true);
    const unseenToday = logged(answersOn(TODAY, 2), false);
    const unseenYesterday = logged(answersOn('2026-10-03', 4), false);
    const eventLog = [...seen, ...unseenToday, ...unseenYesterday];
    const seenEventIds = new Set(seen.map(({ eventId }) => eventId));
    expect(computeUnseenXpToday({ eventLog, seenEventIds, timezone: TIMEZONE, today: TODAY })).toBe(4);
  });

  it('counts an event synced after the profile was requested, since that profile did not include it', () => {
    const syncedLater = logged(answersOn(TODAY, 1), true);
    expect(computeUnseenXpToday({ eventLog: syncedLater, seenEventIds: new Set(), timezone: TIMEZONE, today: TODAY })).toBe(2);
  });
});

describe('combineProfileSummary', () => {
  it('adds unseen XP to the profile XP and keeps the profile streak while today is short', () => {
    expect(combineProfileSummary({ dailyGoal: 20, dayStreak: 3, xpToday: 8 }, 4)).toEqual({ dailyGoal: 20, dayStreak: 3, xpToday: 12 });
  });

  it('adds today to the streak when unseen XP newly meets the goal', () => {
    expect(combineProfileSummary({ dailyGoal: 20, dayStreak: 3, xpToday: 18 }, 2)).toEqual({ dailyGoal: 20, dayStreak: 4, xpToday: 20 });
  });

  it('does not count today twice when the profile already met the goal', () => {
    expect(combineProfileSummary({ dailyGoal: 10, dayStreak: 4, xpToday: 12 }, 6)).toEqual({ dailyGoal: 10, dayStreak: 4, xpToday: 18 });
  });
});

describe('goal history helpers', () => {
  it('replaces a change dated the same day and keeps earlier days', () => {
    const history = setGoalFromDate(
      [
        { from: '2026-09-01', goal: 20 },
        { from: TODAY, goal: 10 },
      ],
      TODAY,
      50,
    );
    expect(history).toEqual([
      { from: '2026-09-01', goal: 20 },
      { from: TODAY, goal: 50 },
    ]);
    expect(findGoalForDate(history, '2026-10-03')).toBe(20);
    expect(findGoalForDate(history, TODAY)).toBe(50);
  });

  it('uses the earliest goal for a date before every change', () => {
    expect(findGoalForDate([{ from: TODAY, goal: 10 }], '2026-01-01')).toBe(10);
  });
});

describe('parseProfile', () => {
  it('reads the goal, streak, and XP today from a /me body', () => {
    expect(parseProfile({ data: { dailyGoal: 50, dayStreak: 2, email: 'ignored', xpToday: 7 } })).toEqual({ dailyGoal: 50, dayStreak: 2, xpToday: 7 });
  });

  it.each([null, {}, { data: null }, { data: { dailyGoal: '20', dayStreak: 0, xpToday: 0 } }, { data: { dailyGoal: 20, dayStreak: -1, xpToday: 0 } }])(
    'refuses a malformed body %#',
    (body) => {
      expect(parseProfile(body)).toBeNull();
    },
  );
});
