// A question found in a locally available bank, with the bank it came from.
import type { Question } from '@syntactical/content-schema';

export type ReviewQuestion = { difficulty: string; language: string; question: Question };
