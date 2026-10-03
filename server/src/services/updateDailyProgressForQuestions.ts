// Brings daily_progress up to date after an insert, touching only what the insert can change
// (the full replay in recomputeDailyProgress is the reference this must equal). Due-review
// decisions are per question, so only the given questions are replayed with the shared
// findDueReviewEventIds and computeXp; each event's stored xp is rewritten where it changed.
// The affected local dates are the dates of the events of those questions whose xp changed
// (the new events start at 0, so they count when they earn anything) plus the dates of the
// newly inserted events; each such date's XP is the sum of stored xp over the user's events on
// that local date, read through a bounded UTC window, and its row is upserted with the goal in
// force on that date.
import { computeXp, findDueReviewEventIds, toLocalDate } from '@syntactical/progress';
import type { GoalChange } from '@syntactical/progress';
import type pg from 'pg';

import { PROGRESS_DEFAULTS } from '../constants/progressDefaults.js';
import type { AnswerEventRow } from '../types/AnswerEventRow.js';

import { toAnswerEvent } from './toAnswerEvent.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MAX_OFFSET_EAST_HOURS = 14;
const MAX_OFFSET_WEST_HOURS = 12;
// UTC offsets run from -12:00 to +14:00, so local date D lies within this window around UTC date D.
const WINDOW_BEFORE_MS = MAX_OFFSET_EAST_HOURS * HOUR_MS;
const WINDOW_AFTER_MS = DAY_MS + MAX_OFFSET_WEST_HOURS * HOUR_MS;

async function loadGoalChanges(client: pg.PoolClient, userId: string): Promise<GoalChange[]> {
  const { rows } = await client.query<{ from_date: string; goal: number }>(
    `SELECT to_char(from_date, 'YYYY-MM-DD') AS from_date, goal FROM daily_goal_changes WHERE user_id = $1`,
    [userId],
  );
  return rows.map(({ from_date, goal }) => ({ from: from_date, goal }));
}

// The change in force on the date, else the default goal (days before the first change).
function findGoal(changes: readonly GoalChange[], localDate: string): number {
  const inForce = changes
    .filter((change) => change.from <= localDate)
    .sort((left, right) => (left.from < right.from ? -1 : 1))
    .pop();
  return inForce?.goal ?? PROGRESS_DEFAULTS.DAILY_GOAL;
}

async function sumDateXp(client: pg.PoolClient, userId: string, localDate: string, zone: string): Promise<number> {
  const dayStart = Date.parse(`${localDate}T00:00:00Z`);
  const { rows } = await client.query<{ answered_at: Date; xp: number }>(
    'SELECT answered_at, xp FROM answer_events WHERE user_id = $1 AND answered_at >= $2 AND answered_at < $3',
    [userId, new Date(dayStart - WINDOW_BEFORE_MS), new Date(dayStart + WINDOW_AFTER_MS)],
  );
  return rows
    .filter((row) => toLocalDate(row.answered_at.toISOString(), zone) === localDate)
    .reduce((sum, row) => sum + row.xp, 0);
}

async function updateDailyProgressForQuestions(
  client: pg.PoolClient,
  userId: string,
  timezone: string | null,
  questionIds: readonly string[],
  insertedEventIds: readonly string[],
): Promise<void> {
  const zone = timezone ?? PROGRESS_DEFAULTS.TIMEZONE;
  const { rows } = await client.query<AnswerEventRow>(
    `SELECT event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, xp
     FROM answer_events WHERE user_id = $1 AND question_id = ANY($2::text[])`,
    [userId, questionIds],
  );
  const events = rows.map(toAnswerEvent);
  const dueIds = findDueReviewEventIds(events);
  const inserted = new Set(insertedEventIds);
  const changedIds: string[] = [];
  const changedXp: number[] = [];
  const dates = new Set<string>();
  rows.forEach((row, index) => {
    const event = events[index];
    if (event === undefined) {
      return;
    }
    const { answeredAt, eventId } = event;
    const xp = computeXp(event, dueIds.has(eventId));
    if (xp !== row.xp) {
      changedIds.push(eventId);
      changedXp.push(xp);
    }
    if (xp !== row.xp || inserted.has(eventId)) {
      dates.add(toLocalDate(answeredAt, zone));
    }
  });
  if (changedIds.length > 0) {
    await client.query(
      `UPDATE answer_events AS e SET xp = t.xp
       FROM unnest($2::uuid[], $3::int[]) AS t(event_id, xp)
       WHERE e.user_id = $1 AND e.event_id = t.event_id`,
      [userId, changedIds, changedXp],
    );
  }
  const localDates = [...dates].sort();
  if (localDates.length === 0) {
    return;
  }
  const goals = await loadGoalChanges(client, userId);
  const totals: number[] = [];
  for (const localDate of localDates) {
    totals.push(await sumDateXp(client, userId, localDate, zone));
  }
  await client.query(
    `INSERT INTO daily_progress (user_id, local_date, xp, is_goal_met)
     SELECT $1, local_date, xp, is_goal_met
     FROM unnest($2::date[], $3::int[], $4::boolean[]) AS t(local_date, xp, is_goal_met)
     ON CONFLICT (user_id, local_date) DO UPDATE SET xp = EXCLUDED.xp, is_goal_met = EXCLUDED.is_goal_met`,
    [
      userId,
      localDates,
      totals,
      localDates.map((localDate, index) => (totals[index] ?? 0) >= findGoal(goals, localDate)),
    ],
  );
}

export { updateDailyProgressForQuestions };
