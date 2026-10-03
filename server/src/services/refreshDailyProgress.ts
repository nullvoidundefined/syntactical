// Brings daily_progress up to date after an upload inserted events, inside the caller's
// transaction. When the zone the rows were built in (progress_timezone) differs from the user's
// effective zone, or they were never fully built (null), the full replay runs; otherwise only
// the affected questions and dates are updated.
import type pg from 'pg';

import { PROGRESS_DEFAULTS } from '../constants/progressDefaults.js';
import type { LockedUser } from '../types/LockedUser.js';

import { recomputeDailyProgress } from './recomputeDailyProgress.js';
import { updateDailyProgressForQuestions } from './updateDailyProgressForQuestions.js';

async function refreshDailyProgress(
  client: pg.PoolClient,
  userId: string,
  { progress_timezone: progressTimezone, timezone }: Pick<LockedUser, 'progress_timezone' | 'timezone'>,
  inserted: readonly { event_id: string; question_id: string }[],
  now: Date,
): Promise<void> {
  if (progressTimezone !== (timezone ?? PROGRESS_DEFAULTS.TIMEZONE)) {
    await recomputeDailyProgress(client, userId, timezone, now);
    return;
  }
  await updateDailyProgressForQuestions(
    client,
    userId,
    timezone,
    [...new Set(inserted.map((row) => row.question_id))],
    inserted.map((row) => row.event_id),
  );
}

export { refreshDailyProgress };
