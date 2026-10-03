// Static app configuration: storage keys, stats defaults, and web keyboard bindings.
// Content constants (difficulties, grammars, limits, schema version) live
// in @syntactical/content-schema.
// The stats key keeps its v1 name: it is already shipped, and the stored
// value's own `version` field says which shape it holds.
export const STORAGE_KEY = 'syntactical.stats.v1';
// Each signed-in user's stats persist under their own key; the guest keeps STORAGE_KEY.
export function buildUserStatsKey(userId: string): string {
  return `syntactical.stats.v2.user.${userId}`;
}
// Holds the last stored stats value that failed validation, so a schema
// mismatch or corruption never destroys a player's history silently.
export const REJECTED_STORAGE_KEY = 'syntactical.stats.v1.rejected';
export const STORAGE_SCHEMA_VERSION = 2;
// The stored stats shape before the answer event log, migrated on hydrate.
export const STATS_V1_SCHEMA_VERSION = 1;
// The daily goal a learner starts with until they pick another.
export const DEFAULT_DAILY_GOAL = 20;

// The append-only answer event log, stored apart from stats so a large log
// never slows the stats write. It never exceeds the cap: the oldest synced
// entries are trimmed first, then the oldest unsynced ones.
export const EVENT_LOG_STORAGE_KEY = 'syntactical.events.v1';
export const REJECTED_EVENT_LOG_STORAGE_KEY = 'syntactical.events.v1.rejected';
export const EVENT_LOG_CAP = 5000;

// The non-secret signed-in identity: the user id and every user id that has
// signed in on this device. Never the session value, email, or sign-in code.
export const AUTH_STORAGE_KEY = 'syntactical.auth.v1';

// The longest an API request may take, response and body read together.
export const API_FETCH_TIMEOUT_MS = 10000;

// Web keyboard bindings, matched case-insensitively. A choice key's position
// in its row of four is the choice index (1 and A select the first choice).
export const KEY_BINDINGS = {
  boolFalse: ['F'],
  boolTrue: ['T'],
  choice: ['1', '2', '3', '4', 'A', 'B', 'C', 'D'],
  escape: ['Escape'],
  next: ['Enter'],
  query: ['Q'],
} as const;

// The most events one answer-events upload carries (the server limit).
export const SYNC_BATCH_SIZE = 200;

// Each user id the server stopped at the stored-event cap, with the time (ms)
// it did; they post nothing until the cap clears, but still download.
export const SYNC_CAP_REACHED_STORAGE_KEY = 'syntactical.sync.cap-reached.v1';
// Marks a guest stats fold in progress or done, until the guest reset lands.
export const GUEST_CLAIM_STORAGE_KEY = 'syntactical.stats.guest-claim.v1';

// The most download pages one sync pass requests; the next pass resumes from the stored cursor.
export const SYNC_MAX_PAGES_PER_PASS = 100;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const SYNC_CAP_RETRY_HOURS = 24;
const SYNC_PAST_BOUND_DAYS = 365;
const SYNC_INTERVAL_MINUTES = 5;
const SYNC_FUTURE_TOLERANCE_MINUTES = 5;
const SYNC_BACKOFF_START_SECONDS = 30;
const SYNC_BACKOFF_CAP_MINUTES = 15;

// An event answered more than this far ahead of the device clock is held as timestamp-future.
export const SYNC_FUTURE_TOLERANCE_MS = SYNC_FUTURE_TOLERANCE_MINUTES * MS_PER_MINUTE;

// An event answered more than this far before the device clock is held as timestamp-past.
export const SYNC_PAST_BOUND_MS = SYNC_PAST_BOUND_DAYS * MINUTES_PER_DAY * MS_PER_MINUTE;

// A capped user posts nothing for this long, then one probe batch.
export const SYNC_CAP_RETRY_MS = SYNC_CAP_RETRY_HOURS * MINUTES_PER_HOUR * MS_PER_MINUTE;

// How often a signed-in, online client runs a sync pass.
export const SYNC_INTERVAL_MS = SYNC_INTERVAL_MINUTES * MS_PER_MINUTE;

// A failed pass is retried after this long, doubling each time up to the cap.
export const SYNC_BACKOFF_START_MS = SYNC_BACKOFF_START_SECONDS * MS_PER_SECOND;
export const SYNC_BACKOFF_FACTOR = 2;
export const SYNC_BACKOFF_CAP_MS = SYNC_BACKOFF_CAP_MINUTES * MS_PER_MINUTE;

// HTTP status codes the client branches on.
export const HTTP_STATUS_OK = 200;
export const HTTP_STATUS_CREATED = 201;
export const HTTP_STATUS_ACCEPTED = 202;
export const HTTP_STATUS_MULTIPLE_CHOICES = 300;
export const HTTP_STATUS_BAD_REQUEST = 400;
export const HTTP_STATUS_PAYLOAD_TOO_LARGE = 413;
export const HTTP_STATUS_UNAUTHORIZED = 401;
export const HTTP_STATUS_UNPROCESSABLE = 422;
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
