// Validates a fetched question bank. A malformed question is dropped and
// the rest kept; a malformed root, an unsupported schema, too many
// questions, or no valid questions rejects the bank as a whole.
import { CONTENT_LIMITS, SUPPORTED_SCHEMA_VERSION } from '../../constants/appConfig';
import type { Question } from './contentTypes';

const QUESTION_ID = /^[a-z0-9-]{1,64}$/;

type BankResult =
  | { isValid: true; questions: Question[]; droppedQuestionIds: string[] }
  | { isValid: false; rule: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isOptionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function areValidTags(tags: unknown): boolean {
  if (tags === undefined) return true;
  return Array.isArray(tags) && tags.length <= CONTENT_LIMITS.maxTags && tags.every((tag) => isText(tag, CONTENT_LIMITS.tagLength));
}

function isValidQuery(query: unknown): boolean {
  if (!isRecord(query)) return false;
  const { title, explanation, syntax, tags } = query;
  return (
    isText(title, CONTENT_LIMITS.queryTitleLength) &&
    isText(explanation, CONTENT_LIMITS.longTextLength) &&
    isOptionalText(syntax, CONTENT_LIMITS.longTextLength) &&
    areValidTags(tags)
  );
}

function hasValidChoices(choices: unknown[]): boolean {
  const { minChoices, maxChoices, choiceLength } = CONTENT_LIMITS;
  return (
    choices.length >= minChoices && choices.length <= maxChoices && choices.every((choice) => isText(choice, choiceLength))
  );
}

function isValidChoiceAnswer(choices: unknown, answerIndex: unknown): boolean {
  if (!Array.isArray(choices) || !hasValidChoices(choices)) return false;
  return Number.isInteger(answerIndex) && (answerIndex as number) >= 0 && (answerIndex as number) < choices.length;
}

function isValidAnswerShape(question: Record<string, unknown>): boolean {
  const { type, choices, answerIndex, answer } = question;
  if (type === 'bool') return typeof answer === 'boolean';
  return type === 'mc' && isValidChoiceAnswer(choices, answerIndex);
}

function isValidQuestion(question: unknown): question is Question {
  if (!isRecord(question)) return false;
  const { id, prompt, code, query } = question;
  return (
    typeof id === 'string' &&
    QUESTION_ID.test(id) &&
    isText(prompt, CONTENT_LIMITS.promptLength) &&
    isOptionalText(code, CONTENT_LIMITS.longTextLength) &&
    isValidQuery(query) &&
    isValidAnswerShape(question)
  );
}

function describeQuestionId(question: unknown): string {
  return isRecord(question) && typeof question.id === 'string' ? question.id : '(no id)';
}

function partitionQuestions(entries: unknown[]): { questions: Question[]; droppedQuestionIds: string[] } {
  const seenIds = new Set<string>();
  const questions: Question[] = [];
  const droppedQuestionIds: string[] = [];
  for (const entry of entries) {
    if (isValidQuestion(entry) && !seenIds.has(entry.id)) {
      seenIds.add(entry.id);
      questions.push(entry);
    } else {
      droppedQuestionIds.push(describeQuestionId(entry));
    }
  }
  return { questions, droppedQuestionIds };
}

export function validateQuestionBank(input: unknown): BankResult {
  if (!isRecord(input) || !Array.isArray(input.questions)) return { isValid: false, rule: 'root shape is invalid' };
  if (input.schemaVersion !== SUPPORTED_SCHEMA_VERSION) return { isValid: false, rule: 'schemaVersion is not supported' };
  if (input.questions.length > CONTENT_LIMITS.maxQuestions) return { isValid: false, rule: 'too many questions' };
  const { questions, droppedQuestionIds } = partitionQuestions(input.questions);
  if (questions.length === 0) return { isValid: false, rule: 'no valid questions' };
  return { isValid: true, questions, droppedQuestionIds };
}
