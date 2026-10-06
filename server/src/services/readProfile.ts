// The /v1/me profile (B-35): the user's email, whether they have a password (never the hash), their timezone, the daily goal in force today, the
// day streak, XP today and in total from stored daily_progress, and the product ids of the
// entitlements currently granted. Today is the current date in the user's timezone (UTC when
// none is stored).
import { computeDayStreak, toLocalDate } from '@syntactical/progress';
import type { DailyProgress } from '@syntactical/progress';
import type pg from 'pg';

import type { Database } from '../clients/database.js';
import { PROGRESS_DEFAULTS } from '../constants/progressDefaults.js';
import type { Profile } from '../types/Profile.js';

type Queryable = Database | pg.PoolClient;

async function readGoal(queryable: Queryable, userId: string, today: string): Promise<number> {
  const { rows } = await queryable.query<{ goal: number }>(
    `SELECT goal FROM daily_goal_changes WHERE user_id = $1 AND from_date <= $2::date
     ORDER BY from_date DESC LIMIT 1`,
    [userId, today],
  );
  const [row] = rows;
  return row ? row.goal : PROGRESS_DEFAULTS.DAILY_GOAL;
}

async function readProgress(queryable: Queryable, userId: string): Promise<DailyProgress[]> {
  const { rows } = await queryable.query<{ is_goal_met: boolean; local_date: string; xp: number }>(
    `SELECT to_char(local_date, 'YYYY-MM-DD') AS local_date, xp, is_goal_met
     FROM daily_progress WHERE user_id = $1`,
    [userId],
  );
  return rows.map(({ is_goal_met: isGoalMet, local_date: localDate, xp }) => ({ isGoalMet, localDate, xp }));
}

async function readEntitlements(queryable: Queryable, userId: string): Promise<string[]> {
  const { rows } = await queryable.query<{ product_id: string }>(
    `SELECT product_id FROM entitlements WHERE user_id = $1 AND status = 'granted' ORDER BY product_id`,
    [userId],
  );
  return rows.map(({ product_id: productId }) => productId);
}

// Undefined when the user no longer exists.
async function readProfile(queryable: Queryable, userId: string, now: Date): Promise<Profile | undefined> {
  const { rows } = await queryable.query<{
    email: string;
    has_password: boolean;
    is_admin: boolean;
    timezone: string | null;
  }>('SELECT email, password_hash IS NOT NULL AS has_password, is_admin, timezone FROM users WHERE id = $1', [userId]);
  const [user] = rows;
  if (!user) {
    return undefined;
  }
  const { email, has_password: hasPassword, is_admin: isAdmin, timezone } = user;
  const today = toLocalDate(now.toISOString(), timezone ?? PROGRESS_DEFAULTS.TIMEZONE);
  const [dailyGoal, progress, entitlements] = [
    await readGoal(queryable, userId, today),
    await readProgress(queryable, userId),
    await readEntitlements(queryable, userId),
  ];
  return {
    dailyGoal,
    dayStreak: computeDayStreak(progress, today),
    email,
    entitlements,
    hasPassword,
    isAdmin,
    timezone,
    xpToday: progress.find(({ localDate }) => localDate === today)?.xp ?? 0,
    xpTotal: progress.reduce((sum, { xp }) => sum + xp, 0),
  };
}

export { readProfile };
