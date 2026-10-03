// PATCH /v1/me's write (B-35): in one transaction, under the same per-user row lock uploads
// take (taken without waiting; a held lock answers busy), stores a new timezone and records a daily goal change effective from today in the
// user's timezone (the new one when both change), then rebuilds daily_progress, since both
// decide which local day an answer counts toward and whether that day's goal was met.
import { toLocalDate } from '@syntactical/progress';

import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';
import { PROGRESS_DEFAULTS } from '../constants/progressDefaults.js';
import type { MeUpdate } from '../schemas/meSchemas.js';
import type { UpdateProfileResult } from '../types/UpdateProfileResult.js';

import { lockUserRow } from './lockUserRow.js';
import { readProfile } from './readProfile.js';
import { recomputeDailyProgress } from './recomputeDailyProgress.js';

async function updateProfile(
  database: Database,
  userId: string,
  update: MeUpdate,
  now: Date,
): Promise<UpdateProfileResult> {
  return withTransaction(database, async (client) => {
    const lock = await lockUserRow(client, userId);
    if (lock.kind !== 'locked') {
      return { kind: lock.kind };
    }
    const { user } = lock;
    const { dailyGoal, timezone: newTimezone } = update;
    if (newTimezone !== undefined) {
      await client.query('UPDATE users SET timezone = $2 WHERE id = $1', [userId, newTimezone]);
    }
    const timezone = newTimezone ?? user.timezone;
    if (dailyGoal !== undefined) {
      const today = toLocalDate(now.toISOString(), timezone ?? PROGRESS_DEFAULTS.TIMEZONE);
      await client.query(
        `INSERT INTO daily_goal_changes (user_id, from_date, goal) VALUES ($1, $2::date, $3)
         ON CONFLICT (user_id, from_date) DO UPDATE SET goal = EXCLUDED.goal`,
        [userId, today, dailyGoal],
      );
    }
    await recomputeDailyProgress(client, userId, timezone, now);
    const profile = await readProfile(client, userId, now);
    return profile ? { kind: 'updated', profile } : { kind: 'missing' };
  });
}

export { updateProfile };
