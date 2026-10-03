// The day streak: consecutive local dates with the daily goal met, ending
// today when today is met, otherwise ending yesterday, so a day still in
// progress never breaks a streak. Dates after today are ignored, and the
// result does not depend on the order of `progress`.
import { isLocalDate } from './isLocalDate.js';
import type { DailyProgress } from './types/DailyProgress.js';

const ISO_DATE_LENGTH = 10;

function previousLocalDate(localDate: string): string {
    if (!isLocalDate(localDate)) {
        throw new RangeError(`Not a YYYY-MM-DD calendar date: ${localDate}`);
    }
    const date = new Date(`${localDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, ISO_DATE_LENGTH);
}

export function computeDayStreak(progress: readonly DailyProgress[], today: string): number {
    const yesterday = previousLocalDate(today);
    const metDates = new Set(
        progress.filter(({ isGoalMet }) => isGoalMet).map(({ localDate }) => localDate),
    );
    let cursor = metDates.has(today) ? today : yesterday;
    let streak = 0;
    while (metDates.has(cursor)) {
        streak += 1;
        cursor = previousLocalDate(cursor);
    }
    return streak;
}
