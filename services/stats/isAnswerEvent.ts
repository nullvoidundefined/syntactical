// Whether a value is a well-formed answer event (the fields the server stores).
import { isRecord } from '@syntactical/content-schema';
import type { AnswerEvent } from '@syntactical/progress';

const ROUND_KINDS: readonly unknown[] = ['bank', 'review', 'topic'];

function isIsoInstant(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function isAnswerEvent(value: unknown): value is AnswerEvent {
  if (!isRecord(value)) return false;
  const { answeredAt, bankKey, choiceIndex, eventId, isCorrect, questionId, roundKind } = value;
  return (
    isIsoInstant(answeredAt) &&
    typeof bankKey === 'string' &&
    Number.isInteger(choiceIndex) &&
    typeof eventId === 'string' &&
    typeof isCorrect === 'boolean' &&
    typeof questionId === 'string' &&
    ROUND_KINDS.includes(roundKind)
  );
}
