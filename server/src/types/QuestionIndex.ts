// Every bank's validated questions held in memory: bank key (`language/difficulty`) to question id
// to the question. Paid banks are included only when the paid content directory is given.
import type { Question } from '@syntactical/content-schema';

type QuestionIndex = ReadonlyMap<string, ReadonlyMap<string, Question>>;

export type { QuestionIndex };
