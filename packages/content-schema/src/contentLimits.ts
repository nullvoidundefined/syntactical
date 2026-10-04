// Size and count limits applied to fetched and built content.
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
const RATIONALE_LENGTH = 280;
const MISCONCEPTION_DESCRIPTION_LENGTH = 280;
const REFERENCE_ID_LENGTH = 64;
const MAX_TOPICS = 20;
const MAX_MISCONCEPTIONS = 40;
const MAX_EVIDENCE_SOURCES = 3;
const SOURCE_URL_LENGTH = 2048;
const FETCH_TIMEOUT_MS = 8000;

export const CONTENT_LIMITS = {
  bankBytes: BANK_KILOBYTES * BYTES_PER_KILOBYTE,
  choiceLength: CHOICE_LENGTH,
  displayFieldLength: DISPLAY_FIELD_LENGTH,
  fetchTimeoutMs: FETCH_TIMEOUT_MS,
  longTextLength: LONG_TEXT_LENGTH,
  manifestBytes: MANIFEST_KILOBYTES * BYTES_PER_KILOBYTE,
  maxChoices: MAX_CHOICES,
  maxEvidenceSources: MAX_EVIDENCE_SOURCES,
  maxMisconceptions: MAX_MISCONCEPTIONS,
  maxQuestions: MAX_QUESTIONS_PER_BANK,
  maxTags: MAX_TAGS,
  maxTopics: MAX_TOPICS,
  minChoices: 2,
  misconceptionDescriptionLength: MISCONCEPTION_DESCRIPTION_LENGTH,
  promptLength: PROMPT_LENGTH,
  queryTitleLength: QUERY_TITLE_LENGTH,
  rationaleLength: RATIONALE_LENGTH,
  referenceIdLength: REFERENCE_ID_LENGTH,
  sourceUrlLength: SOURCE_URL_LENGTH,
  tagLength: TAG_LENGTH,
} as const;
