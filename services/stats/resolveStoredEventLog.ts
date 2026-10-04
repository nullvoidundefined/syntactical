// Turns the stored answer event log read into the log to start from. A
// read that failed starts empty with new events kept in memory, so a
// transient storage error never overwrites unsynced events. Well-formed
// entries are kept; malformed ones (or a stored value that is not a list at
// all) are dropped, and the next change stores only the kept entries.
import type { StoredRead } from '../../clients/types/StoredRead';

import { isLoggedAnswerEvent } from './isLoggedAnswerEvent';
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

type ResolvedEventLog = { eventLog: LoggedAnswerEvent[]; isPersistenceBlocked: boolean };

export function resolveStoredEventLog(read: StoredRead): ResolvedEventLog {
  const { isReadFailed, value: raw } = read;
  if (isReadFailed) return { eventLog: [], isPersistenceBlocked: true };
  const eventLog = Array.isArray(raw) ? raw.filter(isLoggedAnswerEvent) : [];
  return { eventLog, isPersistenceBlocked: false };
}
