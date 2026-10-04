// Clears the hold, and its reason, on the named entries of the event log.
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function releaseEvents(log: LoggedAnswerEvent[], eventIds: string[]): LoggedAnswerEvent[] {
  const named = new Set(eventIds);
  return log.map((entry) => {
    const { eventId, isHeld } = entry;
    if (!named.has(eventId) || !isHeld) return entry;
    const { heldReason: _dropped, ...rest } = entry;
    return { ...rest, isHeld: false };
  });
}
