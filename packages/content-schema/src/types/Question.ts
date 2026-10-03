// A validated question: multiple choice, A/B, or true/false, sharing a base shape.
import type { Choice } from './Choice.js';
import type { Criterion } from './Criterion.js';
import type { Provenance } from './Provenance.js';
import type { Query } from './Query.js';

type QuestionBase = {
  id: string;
  topic?: string;
  prompt: string;
  code?: string;
  query: Query;
  provenance: Provenance;
};

export type Question =
  | (QuestionBase & { type: 'mc'; choices: Choice[]; answerIndex: number })
  | (QuestionBase & { type: 'ab'; choices: [Choice, Choice]; answerIndex: 0 | 1; criterion: Criterion })
  | (QuestionBase & { type: 'bool'; answer: boolean; rationale?: string; misconceptionId?: string });
