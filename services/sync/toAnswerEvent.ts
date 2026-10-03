// Strips an event log entry to the fields the server stores.
import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../stats/types/LoggedAnswerEvent';

export function toAnswerEvent(entry: LoggedAnswerEvent): AnswerEvent {
  const { answeredAt, bankKey, choiceIndex, eventId, isCorrect, questionId, roundKind } = entry;
  return { answeredAt, bankKey, choiceIndex, eventId, isCorrect, questionId, roundKind };
}
