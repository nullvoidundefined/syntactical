// Sets one flag (synced or held) on the named entries of the event log and
// leaves every other entry as it was.
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function markEvents(log: LoggedAnswerEvent[], eventIds: string[], flag: 'isHeld' | 'isSynced'): LoggedAnswerEvent[] {
  const named = new Set(eventIds);
  return log.map((entry) => (named.has(entry.eventId) && !entry[flag] ? { ...entry, [flag]: true } : entry));
}
