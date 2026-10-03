// Every ts-fsrs parameter the review replay depends on, stated rather than
// left to library defaults, so the app and the server reach the same due
// dates (B-48). The weights come from the exactly pinned ts-fsrs version.
// Fuzz stays off because it would make replays differ.
const REQUEST_RETENTION = 0.9;
const MAXIMUM_INTERVAL_DAYS = 36500;

export const SCHEDULER_PARAMETERS = {
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    maximum_interval: MAXIMUM_INTERVAL_DAYS,
    relearning_steps: ['10m'],
    request_retention: REQUEST_RETENTION,
} as const;
