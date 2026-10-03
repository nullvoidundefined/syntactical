// Trims an answer event log to the cap (owner decision 2026-10-03, "Cap
// unsynced, drop oldest"): the oldest synced entries go first; if the log is
// still over, the oldest unsynced entries go too.
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

export function capEventLog(log: LoggedAnswerEvent[]): LoggedAnswerEvent[] {
  if (log.length <= EVENT_LOG_CAP) return log;
  const withoutSynced = dropOldest(log, log.length - EVENT_LOG_CAP, ({ isSynced }) => isSynced);
  return dropOldest(withoutSynced, withoutSynced.length - EVENT_LOG_CAP, () => true);
}
