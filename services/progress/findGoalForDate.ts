// The daily goal in force on a local date: the latest change dated on or
// before it, the earliest change for a date before every change, and the
// default goal when the history is empty.
import type { GoalChange } from '@syntactical/progress';

import { DEFAULT_DAILY_GOAL } from '../../constants/appConfig';

export function findGoalForDate(goalHistory: readonly GoalChange[], localDate: string): number {
  const sorted = [...goalHistory].sort((left, right) => left.from.localeCompare(right.from));
  const [earliest] = sorted;
  if (earliest === undefined) return DEFAULT_DAILY_GOAL;
  let { goal } = earliest;
  for (const change of sorted) {
    if (change.from > localDate) break;
    ({ goal } = change);
  }
  return goal;
}
