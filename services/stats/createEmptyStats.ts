// A fresh v2 stats object with every counter at zero and the default daily
// goal in force from today.
import { DEFAULT_DAILY_GOAL, STORAGE_SCHEMA_VERSION } from '../../constants/appConfig';

import type { Stats } from './types/Stats';

export function createEmptyStats(today: string): Stats {
  return {
    answerStreak: { best: 0, current: 0 },
    goalHistory: [{ from: today, goal: DEFAULT_DAILY_GOAL }],
    isSignUpPromptDismissed: false,
    totals: { attempted: 0, correct: 0 },
    tracks: {},
    version: STORAGE_SCHEMA_VERSION,
  };
}
