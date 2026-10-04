// A stored answer_events row as pg returns it.
import type { AnswerEvent } from '@syntactical/progress';

interface AnswerEventRow {
  answered_at: Date;
  bank_key: string;
  choice_index: number;
  event_id: string;
  is_correct: boolean;
  question_id: string;
  round_kind: AnswerEvent['roundKind'];
}

export type { AnswerEventRow };
