// Whether a value read from storage is a well-formed answer event log entry.
import { isRecord } from '@syntactical/content-schema';

import { isAnswerEvent } from './isAnswerEvent';
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function isLoggedAnswerEvent(value: unknown): value is LoggedAnswerEvent {
  if (!isRecord(value) || !isAnswerEvent(value)) return false;
  const { isHeld, isSynced, ownerUserId } = value as Record<string, unknown>;
  return typeof isHeld === 'boolean' && typeof isSynced === 'boolean' && (ownerUserId === null || typeof ownerUserId === 'string');
}
