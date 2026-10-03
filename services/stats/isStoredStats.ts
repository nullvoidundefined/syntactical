// Whether a value read from storage has the full v2 stats shape. A value
// that parses as JSON but is malformed (null, {}, a partial object) would
// crash the first answer, so the provider falls back to empty stats instead.
import { isRecord } from '@syntactical/content-schema';
import { DAILY_GOALS, isLocalDate } from '@syntactical/progress';

import { STORAGE_SCHEMA_VERSION } from '../../constants/appConfig';

import { hasStatsCounts } from './hasStatsCounts';
import type { Stats } from './types/Stats';

function isGoalChange(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { from, goal } = value;
  return typeof from === 'string' && isLocalDate(from) && DAILY_GOALS.some((dailyGoal) => dailyGoal === goal);
}

export function isStoredStats(value: unknown): value is Stats {
  if (!isRecord(value)) return false;
  const { goalHistory, isSignUpPromptDismissed, syncCursor, syncCursorOwner, version } = value;
  return (
    version === STORAGE_SCHEMA_VERSION &&
    hasStatsCounts(value, 'answerStreak') &&
    Array.isArray(goalHistory) &&
    goalHistory.every(isGoalChange) &&
    typeof isSignUpPromptDismissed === 'boolean' &&
    (syncCursor === undefined || typeof syncCursor === 'string') &&
    (syncCursorOwner === undefined || typeof syncCursorOwner === 'string')
  );
}
