// Static app configuration: the difficulty display registry, question
// types, and storage keys. Languages come from the fetched manifest.
export const DIFFICULTIES = [
  {
    description: 'Foundational syntax and idioms, still language-specific.',
    id: 'easy',
    label: 'Easy',
  },
  { description: 'Core syntax and everyday behavior.', id: 'medium', label: 'Medium' },
  {
    description: 'Internals, edge cases, and the questions that bite in review.',
    id: 'hard',
    label: 'Hard',
  },
] as const;

export type DifficultyId = (typeof DIFFICULTIES)[number]['id'];

export const QUESTION_TYPES = { BOOLEAN: 'bool', MULTIPLE_CHOICE: 'mc' } as const;

export const STORAGE_KEY = 'syntactical.stats.v1';
export const STORAGE_SCHEMA_VERSION = 1;

export const SUPPORTED_SCHEMA_VERSION = 1;

export const GRAMMARS = [
  'python',
  'sql',
  'javascript',
  'typescript',
  'go',
  'rust',
  'ruby',
  'bash',
  'plain',
] as const;
export type Grammar = (typeof GRAMMARS)[number];

const BYTES_PER_KILOBYTE = 1024;
const MANIFEST_KILOBYTES = 64;
const BANK_KILOBYTES = 512;
const MAX_QUESTIONS_PER_BANK = 500;
const DISPLAY_FIELD_LENGTH = 120;
const PROMPT_LENGTH = 2000;
const CHOICE_LENGTH = 300;
const MAX_CHOICES = 4;
const QUERY_TITLE_LENGTH = 200;
const LONG_TEXT_LENGTH = 4000;
const MAX_TAGS = 10;
const TAG_LENGTH = 40;
const FETCH_TIMEOUT_MS = 8000;

export const CONTENT_LIMITS = {
  bankBytes: BANK_KILOBYTES * BYTES_PER_KILOBYTE,
  choiceLength: CHOICE_LENGTH,
  displayFieldLength: DISPLAY_FIELD_LENGTH,
  fetchTimeoutMs: FETCH_TIMEOUT_MS,
  longTextLength: LONG_TEXT_LENGTH,
  manifestBytes: MANIFEST_KILOBYTES * BYTES_PER_KILOBYTE,
  maxChoices: MAX_CHOICES,
  maxQuestions: MAX_QUESTIONS_PER_BANK,
  maxTags: MAX_TAGS,
  minChoices: 2,
  promptLength: PROMPT_LENGTH,
  queryTitleLength: QUERY_TITLE_LENGTH,
  tagLength: TAG_LENGTH,
} as const;
