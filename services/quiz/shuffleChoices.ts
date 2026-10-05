import type { Question } from '@syntactical/content-schema';

import { shuffleQuestions } from './shuffleQuestions';

export function shuffleChoices(question: Question, random: () => number = Math.random): Question {
  if (question.type !== 'mc') return question;

  const correctChoice = question.choices[question.answerIndex];
  const choices = shuffleQuestions(question.choices, random);
  return { ...question, choices, answerIndex: choices.indexOf(correctChoice) };
}
