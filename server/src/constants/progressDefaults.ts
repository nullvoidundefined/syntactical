// What progress assumes before a user has chosen: the timezone for a user with none stored
// and the daily goal before the first recorded goal change. One place so the upload, the
// profile read, and the profile update agree.
const PROGRESS_DEFAULTS = {
  DAILY_GOAL: 20,
  TIMEZONE: 'UTC',
} as const;

export { PROGRESS_DEFAULTS };
