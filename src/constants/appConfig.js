// Static configuration: language tracks, difficulty tiers, and the
// keyboard-binding map shown in the UI and consumed by useKeyboardNav.

export const LANGUAGES = [
  {
    id: 'python',
    label: 'Python',
    glyph: 'PY',
    tagline: 'Runtime semantics, stdlib, and the sharp edges.',
  },
  {
    id: 'postgres',
    label: 'Postgres',
    glyph: 'PG',
    tagline: 'Query planning, concurrency, and storage internals.',
  },
];

export const DIFFICULTIES = [
  {
    id: 'medium',
    label: 'Medium',
    description: 'Core syntax and everyday behavior.',
  },
  {
    id: 'hard',
    label: 'Hard',
    description: 'Internals, edge cases, and the questions that bite in review.',
  },
];

export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'mc',
  BOOLEAN: 'bool',
};

export const KEY_BINDINGS = {
  choice: ['1', '2', '3', '4', 'A', 'B', 'C', 'D'],
  boolTrue: ['T'],
  boolFalse: ['F'],
  next: ['Enter'],
  query: ['Q'],
  escape: ['Escape'],
};

export const STORAGE_KEY = 'syntactical.stats.v1';

export const STORAGE_SCHEMA_VERSION = 1;
