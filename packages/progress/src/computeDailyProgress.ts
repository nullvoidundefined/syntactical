// Daily progress from answer events: XP summed per local date in the user's
// timezone, each day marked met against the goal in force on that date. The
// result is sorted by date and does not depend on event order. Events are
// deduplicated by eventId, keeping the first occurrence. A goal applies from
// its `from` date on, and a date before the first change uses the earliest
// goal. The goal history must hold only daily goals on distinct YYYY-MM-DD
// dates; anything else throws rather than being resolved by array order.
import { computeXp } from './computeXp.js';
import { DAILY_GOALS } from './constants.js';
import { isLocalDate } from './isLocalDate.js';
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

function isDailyGoal(goal: number): boolean {
    return DAILY_GOALS.some((dailyGoal) => dailyGoal === goal);
}

function sortGoalHistory(goalHistory: readonly GoalChange[]): GoalChange[] {
    const seenDates = new Set<string>();
    for (const { from, goal } of goalHistory) {
        if (!isLocalDate(from)) {
            throw new RangeError(`Goal change from is not a YYYY-MM-DD calendar date: ${from}`);
        }
        if (!isDailyGoal(goal)) {
            throw new RangeError(`Goal change goal is not a daily goal: ${goal}`);
        }
        if (seenDates.has(from)) {
            throw new RangeError(`Two goal changes share the from date ${from}`);
        }
        seenDates.add(from);
    }
    return [...goalHistory].sort((left, right) => compareText(left.from, right.from));
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
    const sortedGoals = sortGoalHistory(goalHistory);
    const seenEventIds = new Set<string>();
    const xpByDate = new Map<string, number>();
    for (const event of events) {
        const { answeredAt, eventId } = event;
        if (seenEventIds.has(eventId)) {
            continue;
        }
        seenEventIds.add(eventId);
        const localDate = toLocalDate(answeredAt, timezone);
        const xp = computeXp(event, isDueReview(event));
        xpByDate.set(localDate, (xpByDate.get(localDate) ?? 0) + xp);
    }
    return [...xpByDate.keys()].sort(compareText).map((localDate) => {
        const xp = xpByDate.get(localDate) ?? 0;
        return { isGoalMet: xp >= findGoal(sortedGoals, localDate), localDate, xp };
    });
}
