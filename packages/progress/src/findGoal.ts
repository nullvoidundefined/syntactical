// The daily goal in force on a local date: the latest change dated on or
// before it, or the earliest change for a date before every change. The
// history may arrive in any order; an empty history has no goal and throws.
import type { GoalChange } from './types/GoalChange.js';

export function findGoal(goalHistory: readonly GoalChange[], localDate: string): number {
    const sortedGoals = [...goalHistory].sort((left, right) => left.from.localeCompare(right.from));
    const [earliest] = sortedGoals;
    if (!earliest) {
        throw new RangeError('Goal history is empty; no daily goal applies');
    }
    let { goal } = earliest;
    for (const change of sortedGoals) {
        if (change.from > localDate) {
            break;
        }
        ({ goal } = change);
    }
    return goal;
}
