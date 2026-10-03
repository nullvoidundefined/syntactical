// Appends one event to the answer event log, which never exceeds the cap
// (owner decision 2026-10-03, "Cap unsynced, drop oldest"). Past the cap,
// the oldest synced entries are trimmed first; if the log is still over,
// the oldest unsynced entries are dropped too. Stats totals are stored
// separately and are unaffected.
import { EVENT_LOG_CAP } from '../../constants/appConfig';

import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

function dropOldest(log: LoggedAnswerEvent[], count: number, shouldDrop: (entry: LoggedAnswerEvent) => boolean): LoggedAnswerEvent[] {
  let remaining = count;
  return log.filter((entry) => {
    if (remaining <= 0 || !shouldDrop(entry)) return true;
    remaining -= 1;
    return false;
  });
}

export function appendAnswerEvent(log: readonly LoggedAnswerEvent[], event: LoggedAnswerEvent): LoggedAnswerEvent[] {
  const next = [...log, event];
  if (next.length <= EVENT_LOG_CAP) return next;
  const withoutSynced = dropOldest(next, next.length - EVENT_LOG_CAP, ({ isSynced }) => isSynced);
  return dropOldest(withoutSynced, withoutSynced.length - EVENT_LOG_CAP, () => true);
}
