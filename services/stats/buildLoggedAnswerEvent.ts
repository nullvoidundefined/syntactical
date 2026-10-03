// Builds the event log entry for one recorded answer: bank key
// `language/difficulty`, unsynced and not held.
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';
import type { RecordedAnswer } from './types/RecordedAnswer';

type EventStamp = { answeredAt: string; eventId: string; ownerUserId: string | null };

export function buildLoggedAnswerEvent(answer: RecordedAnswer, stamp: EventStamp): LoggedAnswerEvent {
  const { choiceIndex, difficulty, language, questionId, roundKind, wasCorrect } = answer;
  const { answeredAt, eventId, ownerUserId } = stamp;
  return {
    answeredAt,
    bankKey: `${language}/${difficulty}`,
    choiceIndex,
    eventId,
    isCorrect: wasCorrect,
    isHeld: false,
    isSynced: false,
    ownerUserId,
    questionId,
    roundKind,
  };
}
