// A validated question: multiple choice or true/false, sharing a base shape.
import type { Query } from './Query.js';

type QuestionBase = { id: string; prompt: string; code?: string; query: Query };

export type Question =
  | (QuestionBase & { type: 'mc'; choices: string[]; answerIndex: number })
  | (QuestionBase & { type: 'bool'; answer: boolean });
