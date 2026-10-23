// The Monday (YYYY-MM-DD) of the week a local calendar date falls in, so a study note is keyed by
// the learner's own week. Pure date arithmetic on the date's digits; no timezone is involved.
const DAY_MS = 86_400_000;
const DAYS_AFTER_MONDAY = [6, 0, 1, 2, 3, 4, 5];

function toWeekStart(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  const monday = new Date(date.getTime() - DAYS_AFTER_MONDAY[date.getUTCDay()] * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

export { toWeekStart };
