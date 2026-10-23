// Limits for GET /v1/study-note: the window of answers a note covers, how many it needs before
// one is written (the same 20 as the on-device weak spots report), how many missed misconceptions
// it names, and a rate limit on reads. A note is written at most once per local week.
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const STUDY_NOTE = {
  MIN_ANSWERS: 20,
  RATE_LIMIT: { PER_USER: 60, WINDOW_MS: HOUR_MS },
  RATE_LIMIT_SCOPE: 'study-note',
  TOP_MISCONCEPTIONS: 3,
  WINDOW_MS: 7 * DAY_MS,
} as const;

export { STUDY_NOTE };
