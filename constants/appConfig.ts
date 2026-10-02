// Static app configuration: the difficulty display registry, question
// types, and storage keys. Languages come from the fetched manifest.
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', description: 'Foundational syntax and idioms, still language-specific.' },
  { id: 'medium', label: 'Medium', description: 'Core syntax and everyday behavior.' },
  { id: 'hard', label: 'Hard', description: 'Internals, edge cases, and the questions that bite in review.' },
] as const;

export type DifficultyId = (typeof DIFFICULTIES)[number]['id'];

export const QUESTION_TYPES = { MULTIPLE_CHOICE: 'mc', BOOLEAN: 'bool' } as const;

export const STORAGE_KEY = 'syntactical.stats.v1';
export const STORAGE_SCHEMA_VERSION = 1;
