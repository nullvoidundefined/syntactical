// The daily goal in force on a local date, from the package's findGoal, and
// the default goal when the history is empty.
import { DEFAULT_DAILY_GOAL, findGoal, type GoalChange } from '@syntactical/progress';

export function findGoalForDate(goalHistory: readonly GoalChange[], localDate: string): number {
  return goalHistory.length === 0 ? DEFAULT_DAILY_GOAL : findGoal(goalHistory, localDate);
}
