// Removes every entry the user owns, synced, unsynced, and held; guest and
// other owners' entries stay, in order.
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function removeUserEvents(log: LoggedAnswerEvent[], userId: string): LoggedAnswerEvent[] {
  return log.filter(({ ownerUserId }) => ownerUserId !== userId);
}
