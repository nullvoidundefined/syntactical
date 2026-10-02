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

export const SUPPORTED_SCHEMA_VERSION = 1;

export const GRAMMARS = ['python', 'sql', 'javascript', 'typescript', 'go', 'rust', 'ruby', 'bash', 'plain'] as const;
export type Grammar = (typeof GRAMMARS)[number];

export const CONTENT_LIMITS = {
  manifestBytes: 64 * 1024,
  bankBytes: 512 * 1024,
  maxQuestions: 500,
  displayFieldLength: 120,
  promptLength: 2000,
  choiceLength: 300,
  minChoices: 2,
  maxChoices: 4,
  queryTitleLength: 200,
  longTextLength: 4000,
  maxTags: 10,
  tagLength: 40,
  fetchTimeoutMs: 8000,
} as const;
