// Migrates stored v1 stats to v2: totals and tracks carry over unchanged,
// `streak` becomes `answerStreak`, and the goal history starts today with
// the default daily goal. The answer event log is stored separately and is
// left untouched, so rerunning the migration never loses events. Throws for
// a `today` that is not a calendar date.
import { isLocalDate } from '@syntactical/progress';

import { DEFAULT_DAILY_GOAL, STORAGE_SCHEMA_VERSION } from '../../constants/appConfig';

import type { Stats } from './types/Stats';
import type { StatsV1 } from './types/StatsV1';

export function migrateStatsV1(stored: StatsV1, today: string): Stats {
  if (!isLocalDate(today)) throw new RangeError(`today is not a YYYY-MM-DD calendar date: ${today}`);
  const { streak, totals, tracks } = stored;
  const { best, current } = streak;
  const { attempted, correct } = totals;
  const copiedTracks = Object.fromEntries(Object.entries(tracks).map(([key, entry]) => [key, { ...entry }]));
  return {
    answerStreak: { best, current },
    goalHistory: [{ from: today, goal: DEFAULT_DAILY_GOAL }],
    isSignUpPromptDismissed: false,
    totals: { attempted, correct },
    tracks: copiedTracks,
    version: STORAGE_SCHEMA_VERSION,
  };
}
