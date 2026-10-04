// Removes every entry the user owns, synced, held, or neither; other owners'
// entries stay. Signing out leaves the device to one owner at a time, and the
// server holds the user's synced history.
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function removeUserEvents(log: LoggedAnswerEvent[], userId: string): LoggedAnswerEvent[] {
  return log.filter(({ ownerUserId }) => ownerUserId !== userId);
}
