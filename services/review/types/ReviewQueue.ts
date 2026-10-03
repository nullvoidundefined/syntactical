// The on-device review queue: the questions due now, most overdue first,
// when the next one comes due (null when nothing is scheduled), and the
// review state it was built from.
import type { ReviewState } from '@syntactical/progress';

import type { ReviewQuestion } from './ReviewQuestion';

export type ReviewQueue = {
  dueQuestions: ReviewQuestion[];
  nextDueAt: string | null;
  questionIndex: Map<string, ReviewQuestion>;
  reviewState: ReviewState;
};
