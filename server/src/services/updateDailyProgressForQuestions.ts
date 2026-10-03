// Brings daily_progress up to date after an insert, touching only what the insert can change
// (the full replay in recomputeDailyProgress is the reference this must equal). Due-review
// decisions are per question, so only the given questions are replayed with the shared
// findDueReviewEventIds and computeXp; each event's stored xp is rewritten where it changed.
// The affected local dates are the dates of the events of those questions whose xp changed
// (the new events start at 0, so they count when they earn anything) plus the dates of the
// newly inserted events; each such date's XP is the sum of stored xp over the user's events on
// that local date, summed for all dates in one statement with one bounded UTC window per date, and the rows are
// upserted in one statement with the goal in force on each date. The statement count does not grow
// with the number of affected dates.
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

// One statement sums the stored xp of every given local date (0 for a date with no events), grouped
// by local date, each date joined to its own bounded UTC window (an index range per date).
async function sumDatesXp(
  client: pg.PoolClient,
  userId: string,
  localDates: readonly string[],
  zone: string,
): Promise<number[]> {
  const starts = localDates.map((localDate) => Date.parse(`${localDate}T00:00:00Z`));
  const { rows } = await client.query<{ local_date: string; xp: number }>(
    `SELECT to_char(d.local_date, 'YYYY-MM-DD') AS local_date, coalesce(sum(e.xp), 0)::int AS xp
     FROM unnest($2::date[], $3::timestamptz[], $4::timestamptz[]) AS d(local_date, lo, hi)
     LEFT JOIN answer_events e
       ON e.user_id = $1
      AND e.answered_at >= d.lo AND e.answered_at < d.hi
      AND (e.answered_at AT TIME ZONE $5)::date = d.local_date
     GROUP BY d.local_date`,
    [
      userId,
      localDates,
      starts.map((start) => new Date(start - WINDOW_BEFORE_MS)),
      starts.map((start) => new Date(start + WINDOW_AFTER_MS)),
      zone,
    ],
  );
  const byDate = new Map(rows.map(({ local_date, xp }) => [local_date, xp]));
  return localDates.map((localDate) => byDate.get(localDate) ?? 0);
}

// One statement upserts the rows of all affected dates.
async function upsertDates(
  client: pg.PoolClient,
  userId: string,
  localDates: readonly string[],
  totals: readonly number[],
  goals: readonly GoalChange[],
): Promise<void> {
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
  const totals = await sumDatesXp(client, userId, localDates, zone);
  await upsertDates(client, userId, localDates, totals, goals);
}

export { updateDailyProgressForQuestions };
