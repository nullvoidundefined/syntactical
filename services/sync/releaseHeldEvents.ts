// Releases the user's timestamp-future holds whose answeredAt is now no more
// than the future tolerance ahead of the device clock. Pure: returns a new log
// and the released ids, and never mutates its input.
import { SYNC_FUTURE_TOLERANCE_MS } from '../../constants/appConfig';
import type { LoggedAnswerEvent } from '../stats/types/LoggedAnswerEvent';

function isReleasable(entry: LoggedAnswerEvent, userId: string, limitMs: number): boolean {
  const { answeredAt, heldReason, isHeld, ownerUserId } = entry;
  return ownerUserId === userId && isHeld && heldReason === 'timestamp-future' && Date.parse(answeredAt) <= limitMs;
}

export function releaseHeldEvents(
  eventLog: LoggedAnswerEvent[],
  userId: string,
  now: Date,
): { eventLog: LoggedAnswerEvent[]; releasedIds: string[] } {
  const limitMs = now.getTime() + SYNC_FUTURE_TOLERANCE_MS;
  const releasedIds: string[] = [];
  const released = eventLog.map((entry) => {
    if (!isReleasable(entry, userId, limitMs)) return entry;
    releasedIds.push(entry.eventId);
    const { heldReason: _dropped, ...rest } = entry;
    return { ...rest, isHeld: false };
  });
  return { eventLog: released, releasedIds };
}
