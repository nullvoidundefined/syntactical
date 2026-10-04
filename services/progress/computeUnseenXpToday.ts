// XP the last /me profile has not counted: the XP of events answered today
// in the given timezone that were not yet synced when that profile was
// requested, with due reviews judged against the whole log.
import { computeXp, findDueReviewEventIds, toLocalDate } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../stats/types/LoggedAnswerEvent';

type UnseenXpInput = {
  eventLog: readonly LoggedAnswerEvent[];
  seenEventIds: ReadonlySet<string>;
  timezone: string;
  today: string;
};

export function computeUnseenXpToday({ eventLog, seenEventIds, timezone, today }: UnseenXpInput): number {
  const dueReviewIds = findDueReviewEventIds(eventLog);
  return eventLog
    .filter(({ answeredAt, eventId }) => !seenEventIds.has(eventId) && toLocalDate(answeredAt, timezone) === today)
    .reduce((sum, event) => sum + computeXp(event, dueReviewIds.has(event.eventId)), 0);
}
