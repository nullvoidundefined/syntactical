// Static configuration: language tracks, difficulty tiers, and the
// keyboard-binding map shown in the UI and consumed by useKeyboardNav.
// Centralized here so every menu step, quiz engine, and keyboard handler
// reads one source of truth instead of hardcoding the language/difficulty
// lists or key bindings in more than one place as new languages and
// difficulty tiers are added.

export const LANGUAGES = [
  {
    id: 'python',
    label: 'Python',
    glyph: 'PY',
    tagline: 'Runtime semantics, stdlib, and the sharp edges.',
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'postgres',
    label: 'Postgres',
    glyph: 'PG',
    tagline: 'Query planning, concurrency, and storage internals.',
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    glyph: 'JS',
    tagline: 'Coercion, scope, and the runtime behavior that surprises.',
    difficulties: ['easy', 'medium', 'hard'],
  },
];

export const DIFFICULTIES = [
  {
    id: 'easy',
    label: 'Easy',
    description: 'Foundational syntax and idioms, still language-specific.',
  },
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

export function getDifficultiesForLanguage(languageId) {
  const allowed = LANGUAGES.find((entry) => entry.id === languageId)?.difficulties ?? [];
  return DIFFICULTIES.filter((difficulty) => allowed.includes(difficulty.id));
}

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
