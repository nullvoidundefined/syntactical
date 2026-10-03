// Daily progress from answer events: XP summed per local date in the user's
// timezone, each day marked met against the goal in force on that date. The
// result is sorted by date and does not depend on event order. A goal applies
// from its `from` date on; entries sharing a `from` date resolve to the later
// array entry (the latest change that day); a date before the first change
// uses the earliest goal.
import { computeXp } from './computeXp.js';
import { toLocalDate } from './toLocalDate.js';
import type { AnswerEvent } from './types/AnswerEvent.js';
import type { DailyProgress } from './types/DailyProgress.js';
import type { GoalChange } from './types/GoalChange.js';

function compareText(left: string, right: string): number {
    if (left < right) {
        return -1;
    }
    return left > right ? 1 : 0;
}

function sortGoalHistory(goalHistory: readonly GoalChange[]): GoalChange[] {
    return goalHistory
        .map((change, index) => ({ change, index }))
        .sort(
            (left, right) =>
                compareText(left.change.from, right.change.from) || left.index - right.index,
        )
        .map(({ change }) => change);
}

function findGoal(sortedGoals: readonly GoalChange[], localDate: string): number {
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

export function computeDailyProgress(
    events: readonly AnswerEvent[],
    timezone: string,
    goalHistory: readonly GoalChange[],
    isDueReview: (event: AnswerEvent) => boolean,
): DailyProgress[] {
    const xpByDate = new Map<string, number>();
    for (const event of events) {
        const localDate = toLocalDate(event.answeredAt, timezone);
        const xp = computeXp(event, isDueReview(event));
        xpByDate.set(localDate, (xpByDate.get(localDate) ?? 0) + xp);
    }
    const sortedGoals = sortGoalHistory(goalHistory);
    return [...xpByDate.keys()].sort(compareText).map((localDate) => {
        const xp = xpByDate.get(localDate) ?? 0;
        return { isGoalMet: xp >= findGoal(sortedGoals, localDate), localDate, xp };
    });
}
