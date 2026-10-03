// Static app configuration: storage keys, stats defaults, and web keyboard bindings.
// Content constants (difficulties, grammars, limits, schema version) live
// in @syntactical/content-schema.
// The stats key keeps its v1 name: it is already shipped, and the stored
// value's own `version` field says which shape it holds.
export const STORAGE_KEY = 'syntactical.stats.v1';
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
