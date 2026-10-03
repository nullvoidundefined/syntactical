// Every misconception a question can reveal: its choices' tags for a
// multiple choice or A/B question, or its own tag for a true/false one.
import type { Question } from '@syntactical/content-schema';

export function listQuestionMisconceptions(question: Question): string[] {
  if (question.type === 'bool') {
    const { misconceptionId } = question;
    return misconceptionId === undefined ? [] : [misconceptionId];
  }
  const ids = question.choices.flatMap(({ misconceptionId }) => (misconceptionId === undefined ? [] : [misconceptionId]));
  return [...new Set(ids)];
}
