// Every bank's validated questions held in memory: bank key (`language/difficulty`) to question id
// to the question.
import type { Question } from '@syntactical/content-schema';

type QuestionIndex = ReadonlyMap<string, ReadonlyMap<string, Question>>;

export type { QuestionIndex };
