// Reads a user's stored daily_progress rows and derives the upload response totals from them
// (no answer_events read): the full list, the sum of stored XP, today's XP, and the streak.
import { computeDayStreak, toLocalDate } from '@syntactical/progress';
import type { DailyProgress } from '@syntactical/progress';
import type pg from 'pg';

import { PROGRESS_DEFAULTS } from '../constants/progressDefaults.js';
import type { ProgressTotals } from '../types/ProgressTotals.js';

async function readStoredProgress(
  client: pg.PoolClient,
  userId: string,
  timezone: string | null,
  now: Date,
): Promise<ProgressTotals> {
  const { rows } = await client.query<{ is_goal_met: boolean; local_date: string; xp: number }>(
    `SELECT to_char(local_date, 'YYYY-MM-DD') AS local_date, xp, is_goal_met
     FROM daily_progress WHERE user_id = $1 ORDER BY local_date`,
    [userId],
  );
  const dailyProgress: DailyProgress[] = rows.map(({ is_goal_met, local_date, xp }) => ({
    isGoalMet: is_goal_met,
    localDate: local_date,
    xp,
  }));
  const today = toLocalDate(now.toISOString(), timezone ?? PROGRESS_DEFAULTS.TIMEZONE);
  return {
    dailyProgress,
    dayStreak: computeDayStreak(dailyProgress, today),
    xpToday: dailyProgress.find((day) => day.localDate === today)?.xp ?? 0,
    xpTotal: dailyProgress.reduce((sum, day) => sum + day.xp, 0),
  };
}

export { readStoredProgress };
