// Reduces the loaded questions to the answer key answer events are checked against: each
// question's correct choice index and choice count. A true/false question's choices are
// True (0) and False (1).
import type { Question } from '@syntactical/content-schema';

import type { AnswerKey } from '../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../types/AnswerKeyEntry.js';
import type { QuestionIndex } from '../types/QuestionIndex.js';

type BoolQuestion = Extract<Question, { type: 'bool' }>;

function toBoolEntry({ answer }: BoolQuestion): AnswerKeyEntry {
  return { answerIndex: answer ? 0 : 1, choiceCount: 2 };
}

function toChoiceEntry({ answerIndex, choices }: Exclude<Question, BoolQuestion>): AnswerKeyEntry {
  return { answerIndex, choiceCount: choices.length };
}

function toAnswerKeyEntry(question: Question): AnswerKeyEntry {
  return question.type === 'bool' ? toBoolEntry(question) : toChoiceEntry(question);
}

function toAnswerKey(questions: QuestionIndex): AnswerKey {
  return new Map(
    [...questions].map(([bankKey, bank]) => [
      bankKey,
      new Map([...bank].map(([id, question]) => [id, toAnswerKeyEntry(question)])),
    ]),
  );
}

export { toAnswerKey };
