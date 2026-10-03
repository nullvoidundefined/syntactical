// What a round reports for one answered question: the bank it came from,
// the question, the chosen choice index, the kind of round, and whether
// the answer was correct.
import type { AnswerEvent } from '@syntactical/progress';

import type { RoundKey } from './RoundKey';

export type RecordedAnswer = RoundKey & {
  choiceIndex: number;
  questionId: string;
  roundKind: AnswerEvent['roundKind'];
  wasCorrect: boolean;
};
