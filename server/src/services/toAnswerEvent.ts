// Maps a stored answer_events row to the shared AnswerEvent the progress functions take.
import type { AnswerEvent } from '@syntactical/progress';

import type { AnswerEventRow } from '../types/AnswerEventRow.js';

function toAnswerEvent({
  answered_at,
  bank_key,
  choice_index,
  event_id,
  is_correct,
  question_id,
  round_kind,
}: AnswerEventRow): AnswerEvent {
  return {
    answeredAt: answered_at.toISOString(),
    bankKey: bank_key,
    choiceIndex: choice_index,
    eventId: event_id,
    isCorrect: is_correct,
    questionId: question_id,
    roundKind: round_kind,
  };
}

export { toAnswerEvent };
