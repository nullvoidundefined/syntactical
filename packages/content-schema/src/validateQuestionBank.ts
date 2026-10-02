// Validates a fetched question bank. A malformed question is dropped and
// the rest kept; a malformed root, an unsupported schema, too many
// questions, or no valid questions rejects the bank as a whole.
import { CONTENT_LIMITS } from './contentLimits.js';
import { BANK_SCHEMA_VERSION } from './bankSchemaVersion.js';
import { collectMisconceptionIds } from './collectMisconceptionIds.js';
import { isRecord } from './isRecord.js';
import { isValidProvenance } from './isValidProvenance.js';
import type { BankContext } from './types/BankContext.js';
import type { Question } from './types/Question.js';

const QUESTION_ID = /^[a-z0-9-]{1,64}$/;

type DroppedQuestion = { id: string; rule: string };

type BankResult =
  | { dropped: DroppedQuestion[]; droppedQuestionIds: string[]; isValid: true; questions: Question[] }
  | { isValid: false; rule: string };

function isText(value: unknown, maxLength: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isOptionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function isOptionalDisplayText(value: unknown): boolean {
  return value === undefined || isText(value, CONTENT_LIMITS.displayFieldLength);
}

function areValidTags(tags: unknown): boolean {
  if (tags === undefined) return true;
  const { maxTags, tagLength } = CONTENT_LIMITS;
  return Array.isArray(tags) && tags.length <= maxTags && tags.every((tag) => isText(tag, tagLength));
}

function isValidQuery(query: unknown): boolean {
  if (!isRecord(query)) return false;
  const { explanation, syntax, tags, title } = query;
  const { longTextLength, queryTitleLength } = CONTENT_LIMITS;
  return (
    isText(title, queryTitleLength) &&
    isText(explanation, longTextLength) &&
    isOptionalText(syntax, longTextLength) &&
    areValidTags(tags)
  );
}

function isValidChoice(choice: unknown): boolean {
  if (!isRecord(choice)) return false;
  const { code, misconceptionId, rationale, text } = choice;
  const { choiceLength, longTextLength } = CONTENT_LIMITS;
  return (
    isText(text, choiceLength) &&
    isOptionalText(code, longTextLength) &&
    (rationale === undefined || typeof rationale === 'string') &&
    isOptionalDisplayText(misconceptionId)
  );
}

function hasValidChoices(choices: unknown[]): boolean {
  const { minChoices, maxChoices } = CONTENT_LIMITS;
  return choices.length >= minChoices && choices.length <= maxChoices && choices.every(isValidChoice);
}

function isValidChoiceAnswer(choices: unknown, answerIndex: unknown): boolean {
  if (!Array.isArray(choices) || !hasValidChoices(choices)) return false;
  return Number.isInteger(answerIndex) && (answerIndex as number) >= 0 && (answerIndex as number) < choices.length;
}

function isValidBoolExtras(question: Record<string, unknown>): boolean {
  const { misconceptionId, rationale } = question;
  return (
    (rationale === undefined || typeof rationale === 'string') &&
    isOptionalDisplayText(misconceptionId)
  );
}

function isValidAnswerShape(question: Record<string, unknown>): boolean {
  const { type, choices, answerIndex, answer } = question;
  if (type === 'bool') return typeof answer === 'boolean' && isValidBoolExtras(question);
  return type === 'mc' && isValidChoiceAnswer(choices, answerIndex);
}

function collectRationales(question: Record<string, unknown>): unknown[] {
  if (question.type === 'bool') return [question.rationale];
  return Array.isArray(question.choices) ? question.choices.map((choice) => (isRecord(choice) ? choice.rationale : undefined)) : [];
}

function hasLongRationale(question: Record<string, unknown>): boolean {
  return collectRationales(question).some(
    (rationale) => typeof rationale === 'string' && rationale.length > CONTENT_LIMITS.rationaleLength,
  );
}

function findUnknownReferenceRule(question: Record<string, unknown>, context: BankContext): string | null {
  if (typeof question.topic === 'string' && !context.topicIds.includes(question.topic)) return 'unknown-topic';
  const hasUnknownId = collectMisconceptionIds(question).some((id) => !context.misconceptionIds.includes(id));
  return hasUnknownId ? 'unknown-misconception' : null;
}

// Returns the rule a question breaks, or null when it is valid.
function findBrokenRule(question: unknown, context: BankContext): string | null {
  if (!isRecord(question)) return 'malformed question';
  const { code, id, prompt, query, topic } = question;
  const { longTextLength, promptLength } = CONTENT_LIMITS;
  const isShapeValid =
    typeof id === 'string' &&
    QUESTION_ID.test(id) &&
    isText(prompt, promptLength) &&
    isOptionalText(code, longTextLength) &&
    isOptionalDisplayText(topic) &&
    isValidQuery(query);
  if (!isShapeValid) return 'malformed question';
  if (hasLongRationale(question)) return 'rationale-too-long';
  if (!isValidAnswerShape(question)) return 'malformed question';
  if (!isValidProvenance(question.provenance)) return 'missing-provenance';
  return findUnknownReferenceRule(question, context);
}

function describeQuestionId(question: unknown): string {
  return isRecord(question) && typeof question.id === 'string' ? question.id : '(no id)';
}

function partitionQuestions(entries: unknown[], context: BankContext): {
  dropped: DroppedQuestion[];
  droppedQuestionIds: string[];
  questions: Question[];
} {
  const seenIds = new Set<string>();
  const questions: Question[] = [];
  const dropped: DroppedQuestion[] = [];
  for (const entry of entries) {
    const rule = findBrokenRule(entry, context);
    if (rule === null && !seenIds.has((entry as Question).id)) {
      seenIds.add((entry as Question).id);
      questions.push(entry as Question);
    } else {
      dropped.push({ id: describeQuestionId(entry), rule: rule ?? 'duplicate id' });
    }
  }
  return { dropped, droppedQuestionIds: dropped.map((drop) => drop.id), questions };
}

export function validateQuestionBank(input: unknown, context: BankContext): BankResult {
  if (!isRecord(input) || !Array.isArray(input.questions)) {
    return { isValid: false, rule: 'root shape is invalid' };
  }
  const { questions: inputQuestions, schemaVersion } = input;
  if (schemaVersion !== BANK_SCHEMA_VERSION) {
    return { isValid: false, rule: 'schemaVersion is not supported' };
  }
  if (inputQuestions.length > CONTENT_LIMITS.maxQuestions) {
    return { isValid: false, rule: 'too many questions' };
  }
  const { dropped, droppedQuestionIds, questions } = partitionQuestions(inputQuestions, context);
  if (questions.length === 0) return { isValid: false, rule: 'no valid questions' };
  return { dropped, droppedQuestionIds, isValid: true, questions };
}
