// Sets one flag (synced or held) on the named entries of the event log and
// leaves every other entry as it was. Holding may record why.
import type { HeldReason, LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function markEvents(
  log: LoggedAnswerEvent[],
  eventIds: string[],
  flag: 'isHeld' | 'isSynced',
  heldReason?: HeldReason,
): LoggedAnswerEvent[] {
  const named = new Set(eventIds);
  return log.map((entry) => {
    if (!named.has(entry.eventId) || entry[flag]) return entry;
    return flag === 'isHeld' && heldReason !== undefined ? { ...entry, heldReason, isHeld: true } : { ...entry, [flag]: true };
  });
}
