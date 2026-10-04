// Whether a value read from storage is a well-formed answer event log entry.
import { isRecord } from '@syntactical/content-schema';

import { isAnswerEvent } from './isAnswerEvent';
import { HELD_REASONS } from './types/LoggedAnswerEvent';
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

function isHeldReason(value: unknown): boolean {
  return value === undefined || (HELD_REASONS as readonly unknown[]).includes(value);
}

export function isLoggedAnswerEvent(value: unknown): value is LoggedAnswerEvent {
  if (!isRecord(value) || !isAnswerEvent(value)) return false;
  const { heldReason, isHeld, isSynced, ownerUserId } = value as Record<string, unknown>;
  return (
    typeof isHeld === 'boolean' &&
    typeof isSynced === 'boolean' &&
    (ownerUserId === null || typeof ownerUserId === 'string') &&
    isHeldReason(heldReason)
  );
}
