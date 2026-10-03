// Gives every guest entry of the event log to the user, in place and in order.
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

export function claimGuestEvents(log: LoggedAnswerEvent[], userId: string): LoggedAnswerEvent[] {
  return log.map((entry) => (entry.ownerUserId === null ? { ...entry, ownerUserId: userId } : entry));
}
