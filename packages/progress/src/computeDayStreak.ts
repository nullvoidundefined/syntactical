// The day streak: consecutive local dates with the daily goal met, ending
// today when today is met, otherwise ending yesterday, so a day still in
// progress never breaks a streak. Dates after today are ignored, and the
// result does not depend on the order of `progress`.
import type { DailyProgress } from './types/DailyProgress.js';

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_LENGTH = 10;

function previousLocalDate(localDate: string): string {
    const match = LOCAL_DATE_PATTERN.exec(localDate);
    if (!match) {
        throw new RangeError(`Not a YYYY-MM-DD date: ${localDate}`);
    }
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.toISOString().slice(0, ISO_DATE_LENGTH) !== localDate) {
        throw new RangeError(`Not a calendar date: ${localDate}`);
    }
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
