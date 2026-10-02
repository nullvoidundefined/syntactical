// The strict publish check: every question needs a topic, and every wrong
// answer (or a true/false question) needs a rationale. The client validator
// stays lenient; this runs in the content build.
import type { BankContext } from './types/BankContext.js';
import type { Question } from './types/Question.js';

type PublishProblem = { id: string; rule: string };

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

function countMissingRationales(question: Question): number {
  if (question.type === 'bool') return hasText(question.rationale) ? 0 : 1;
  return question.choices.filter((choice, index) => index !== question.answerIndex && !hasText(choice.rationale)).length;
}

function findProblems(question: Question): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (!hasText(question.topic)) problems.push({ id: question.id, rule: 'missing-topic' });
  for (let count = countMissingRationales(question); count > 0; count -= 1) {
    problems.push({ id: question.id, rule: 'missing-rationale' });
  }
  return problems;
}

export function validateBankForPublish(
  bank: { questions: Question[] },
  _context: BankContext,
): { problems: PublishProblem[] } {
  return { problems: bank.questions.flatMap(findProblems) };
}
