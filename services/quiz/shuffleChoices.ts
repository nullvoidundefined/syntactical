import type { Question } from '@syntactical/content-schema';

import { shuffleQuestions } from './shuffleQuestions';

export type RoundQuestion =
  | (Extract<Question, { type: 'mc' }> & { bankChoiceIndexes: number[] })
  | Exclude<Question, { type: 'mc' }>;

export function shuffleChoices(question: Question, random: () => number = Math.random): RoundQuestion {
  if (question.type !== 'mc') return question;

  const bankChoiceIndexes = shuffleQuestions(
    question.choices.map((_, index) => index),
    random,
  );
  const choices = bankChoiceIndexes.map((index) => question.choices[index]);
  return { ...question, choices, answerIndex: bankChoiceIndexes.indexOf(question.answerIndex), bankChoiceIndexes };
}
