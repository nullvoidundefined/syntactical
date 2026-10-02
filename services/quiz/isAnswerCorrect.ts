// Whether a submitted answer is correct for its question: a choice index
// for multiple choice, a boolean for true/false.

export function isAnswerCorrect(question: Question, submitted: number | boolean): boolean {
  if (question.type === 'bool') {
    const { answer } = question;
    return submitted === answer;
  }
  const { answerIndex } = question;
  return submitted === answerIndex;
}import type { Question } from '@syntactical/content-schema';

