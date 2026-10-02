// Static app configuration: storage keys and web keyboard bindings.
// Content constants (difficulties, grammars, limits, schema version) live
// in @syntactical/content-schema.
export const STORAGE_KEY = 'syntactical.stats.v1';
// Holds the last stored stats value that failed validation, so a schema
// mismatch or corruption never destroys a player's history silently.
export const REJECTED_STORAGE_KEY = 'syntactical.stats.v1.rejected';
export const STORAGE_SCHEMA_VERSION = 1;


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
