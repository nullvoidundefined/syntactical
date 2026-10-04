// Rebuilds a user's daily_progress rows from every stored answer event, inside the caller's
// transaction, with the shared @syntactical/progress functions (no XP or due-review logic
// lives here). The caller holds the user's row lock. Returns the totals the upload response carries.
import { computeDailyProgress, computeDayStreak, findDueReviewEventIds, toLocalDate } from '@syntactical/progress';
import type { AnswerEvent, DailyProgress, GoalChange } from '@syntactical/progress';
import type pg from 'pg';

import { PROGRESS_DEFAULTS } from '../constants/progressDefaults.js';
import type { AnswerEventRow } from '../types/AnswerEventRow.js';
import type { ProgressTotals } from '../types/ProgressTotals.js';

import { toAnswerEvent } from './toAnswerEvent.js';

async function loadEvents(client: pg.PoolClient, userId: string): Promise<AnswerEvent[]> {
  const { rows } = await client.query<AnswerEventRow>(
    `SELECT event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct
     FROM answer_events WHERE user_id = $1 ORDER BY answered_at, event_id`,
    [userId],
  );
  return rows.map(toAnswerEvent);
}

// Goal 20 applies from the earliest event's local date (or today) until the first recorded change.
async function loadGoalHistory(
  client: pg.PoolClient,
  userId: string,
  fallbackFrom: string,
): Promise<GoalChange[]> {
  const { rows } = await client.query<{ from_date: string; goal: number }>(
    `SELECT to_char(from_date, 'YYYY-MM-DD') AS from_date, goal FROM daily_goal_changes WHERE user_id = $1`,
    [userId],
  );
  const changes = rows.map(({ from_date, goal }) => ({ from: from_date, goal }));
  // Days before the first recorded change kept the default goal: a change applies from its date on.
  const isBaselineMissing = changes.every((change) => change.from > fallbackFrom);
  return isBaselineMissing ? [{ from: fallbackFrom, goal: PROGRESS_DEFAULTS.DAILY_GOAL }, ...changes] : changes;
}

async function replaceDailyProgress(client: pg.PoolClient, userId: string, progress: DailyProgress[]): Promise<void> {
  await client.query('DELETE FROM daily_progress WHERE user_id = $1', [userId]);
  if (progress.length === 0) {
    return;
  }
  await client.query(
    `INSERT INTO daily_progress (user_id, local_date, xp, is_goal_met)
     SELECT $1, local_date, xp, is_goal_met
     FROM unnest($2::date[], $3::int[], $4::boolean[]) AS t(local_date, xp, is_goal_met)`,
    [userId, progress.map((day) => day.localDate), progress.map((day) => day.xp), progress.map((day) => day.isGoalMet)],
  );
}

async function recomputeDailyProgress(
  client: pg.PoolClient,
  userId: string,
  timezone: string | null,
  now: Date,
): Promise<ProgressTotals> {
  const zone = timezone ?? PROGRESS_DEFAULTS.TIMEZONE;
  const events = await loadEvents(client, userId);
  const today = toLocalDate(now.toISOString(), zone);
  const localDates = events.map((event) => toLocalDate(event.answeredAt, zone));
  const goals = await loadGoalHistory(client, userId, [today, ...localDates].sort()[0]);
  const dueIds = findDueReviewEventIds(events);
  const dailyProgress = computeDailyProgress(events, zone, goals, (event) => dueIds.has(event.eventId));
  await replaceDailyProgress(client, userId, dailyProgress);
  const xpTotal = dailyProgress.reduce((sum, day) => sum + day.xp, 0);
  const xpToday = dailyProgress.find((day) => day.localDate === today)?.xp ?? 0;
  return { dailyProgress, dayStreak: computeDayStreak(dailyProgress, today), xpToday, xpTotal };
}

export { recomputeDailyProgress };
