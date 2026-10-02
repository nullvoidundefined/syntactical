// The strict publish check: every question needs a topic, every wrong
// answer (or a true/false question) needs a rationale within the length cap,
// and validation must not have failed or be pending without human review.
// The client validator stays lenient; this runs in the content build.
import { collectMisconceptionIds } from './collectMisconceptionIds.js';
import { CONTENT_LIMITS } from './contentLimits.js';
import { hasMalformedReference } from './hasMalformedReference.js';
import type { BankContext } from './types/BankContext.js';
import type { Question } from './types/Question.js';

type PublishProblem = { id: string; rule: string };

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isBoolQuestion(question: Question): question is Extract<Question, { type: 'bool' }> {
  const { type } = question;
  return type === 'bool';
}

function collectRationales(question: Question): (string | undefined)[] {
  if (isBoolQuestion(question)) return [question.rationale];
  const { answerIndex, choices } = question;
  return choices.filter((_choice, index) => index !== answerIndex).map((choice) => choice.rationale);
}

function findValidationRule(question: Question): string | null {
  const { isHumanReviewed, validation } = question.provenance;
  if (validation.status === 'failed') return 'validation-failed';
  return validation.status === 'pending' && !isHumanReviewed ? 'validation-pending' : null;
}

function findReferenceRules(question: Question, context: BankContext): string[] {
  const rules: string[] = [];
  if (hasText(question.topic) && !context.topicIds.includes(question.topic as string)) rules.push('unknown-topic');
  for (const id of collectMisconceptionIds(question)) {
    if (!context.misconceptionIds.includes(id)) rules.push('unknown-misconception');
  }
  return rules;
}

function findProblems(question: Question, context: BankContext): PublishProblem[] {
  const rules: string[] = [];
  if (hasMalformedReference(question)) rules.push('malformed-reference');
  else if (!hasText(question.topic)) rules.push('missing-topic');
  for (const rationale of collectRationales(question)) {
    if (!hasText(rationale)) rules.push('missing-rationale');
    else if ((rationale as string).length > CONTENT_LIMITS.rationaleLength) rules.push('rationale-too-long');
  }
  rules.push(...findReferenceRules(question, context));
  const validationRule = findValidationRule(question);
  if (validationRule !== null) rules.push(validationRule);
  return rules.map((rule) => ({ id: question.id, rule }));
}

export function validateBankForPublish(
  bank: { questions: Question[] },
  context: BankContext,
): { problems: PublishProblem[] } {
  return { problems: bank.questions.flatMap((question) => findProblems(question, context)) };
}
