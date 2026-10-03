// The rationale for the answer the learner chose, when it was wrong: the chosen choice's
// `rationale` for multiple choice, the question's own `rationale` for true/false. A correct
// answer, an answer that does not fit the question, or a wrong answer with no rationale is undefined.
import type { Question } from '@syntactical/content-schema';

import { isAnswerCorrect } from './isAnswerCorrect';

export function readChosenRationale(question: Question, submitted: number | boolean | null): string | undefined {
  if (submitted === null || isAnswerCorrect(question, submitted)) return undefined;
  if (question.type === 'bool') {
    const { rationale } = question;
    return typeof submitted === 'boolean' ? rationale : undefined;
  }
  const { choices } = question;
  return typeof submitted === 'number' ? choices[submitted]?.rationale : undefined;
}
