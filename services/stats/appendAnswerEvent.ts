// Appends one event to the answer event log. Past the cap, the oldest
// synced entries are trimmed first; an unsynced entry is never trimmed, so
// the log may exceed the cap rather than lose an answer the server lacks.
import { EVENT_LOG_CAP } from '../../constants/appConfig';

import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function appendAnswerEvent(log: readonly LoggedAnswerEvent[], event: LoggedAnswerEvent): LoggedAnswerEvent[] {
  const next = [...log, event];
  let excess = next.length - EVENT_LOG_CAP;
  if (excess <= 0) return next;
  return next.filter(({ isSynced }) => {
    if (excess <= 0 || !isSynced) return true;
    excess -= 1;
    return false;
  });
}
