// Appends one event to the answer event log, which never exceeds the cap
// (see capEventLog). Stats totals are stored separately and are unaffected.
import { capEventLog } from './capEventLog';
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function appendAnswerEvent(log: readonly LoggedAnswerEvent[], event: LoggedAnswerEvent): LoggedAnswerEvent[] {
  return capEventLog([...log, event]);
}
