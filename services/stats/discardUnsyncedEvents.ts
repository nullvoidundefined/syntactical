// Removes the user's entries the server has not acknowledged, held ones
// included; synced entries and every other owner's entries stay.
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function discardUnsyncedEvents(log: LoggedAnswerEvent[], userId: string): LoggedAnswerEvent[] {
  return log.filter(({ isSynced, ownerUserId }) => ownerUserId !== userId || isSynced);
}
