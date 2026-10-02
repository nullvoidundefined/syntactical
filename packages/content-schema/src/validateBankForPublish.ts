// The strict publish check: every question needs a topic, every wrong
// answer (or a true/false question) needs a rationale within the length cap,
// and validation must not have failed or be pending without human review.
// The client validator stays lenient; this runs in the content build.
import { CONTENT_LIMITS } from './contentLimits.js';
import type { BankContext } from './types/BankContext.js';
import type { Question } from './types/Question.js';

type PublishProblem = { id: string; rule: string };

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function collectRationales(question: Question): (string | undefined)[] {
  if (question.type === 'bool') return [question.rationale];
  return question.choices.filter((_choice, index) => index !== question.answerIndex).map((choice) => choice.rationale);
}

function findValidationRule(question: Question): string | null {
  const { isHumanReviewed, validation } = question.provenance;
  if (validation.status === 'failed') return 'validation-failed';
  return validation.status === 'pending' && !isHumanReviewed ? 'validation-pending' : null;
}

function findProblems(question: Question): PublishProblem[] {
  const rules: string[] = [];
  if (!hasText(question.topic)) rules.push('missing-topic');
  for (const rationale of collectRationales(question)) {
    if (!hasText(rationale)) rules.push('missing-rationale');
    else if ((rationale as string).length > CONTENT_LIMITS.rationaleLength) rules.push('rationale-too-long');
  }
  const validationRule = findValidationRule(question);
  if (validationRule !== null) rules.push(validationRule);
  return rules.map((rule) => ({ id: question.id, rule }));
}

export function validateBankForPublish(
  bank: { questions: Question[] },
  _context: BankContext,
): { problems: PublishProblem[] } {
  return { problems: bank.questions.flatMap(findProblems) };
}
