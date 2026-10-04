// Records a new daily goal in force from a local date on: a change already
// dated that day is replaced, so the history never holds two changes for
// one date, and earlier days keep the goal they had.
import type { GoalChange } from '@syntactical/progress';

export function setGoalFromDate(goalHistory: readonly GoalChange[], from: string, goal: number): GoalChange[] {
  return [...goalHistory.filter((change) => change.from !== from), { from, goal }];
}
