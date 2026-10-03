// Whether a value read from storage is a well-formed answer event log entry.
import { isRecord } from '@syntactical/content-schema';

import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

const ROUND_KINDS: readonly unknown[] = ['bank', 'review', 'topic'];

function isIsoInstant(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function hasEventFields(value: Record<string, unknown>): boolean {
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

export function isLoggedAnswerEvent(value: unknown): value is LoggedAnswerEvent {
  if (!isRecord(value) || !hasEventFields(value)) return false;
  const { isHeld, isSynced, ownerUserId } = value;
  return typeof isHeld === 'boolean' && typeof isSynced === 'boolean' && (ownerUserId === null || typeof ownerUserId === 'string');
}
