// Whether one answer event is a due review given the events answered
// before it (see findDueReviewEventIds). Callers may pass the whole log;
// replay order decides what came before. To classify many events at once,
// call findDueReviewEventIds once instead of this per event.
import { findDueReviewEventIds } from './findDueReviewEventIds.js';
import type { AnswerEvent } from './types/AnswerEvent.js';

export function isDueReview(event: AnswerEvent, priorEvents: readonly AnswerEvent[]): boolean {
    const { eventId } = event;
    const others = priorEvents.filter((prior) => prior.eventId !== eventId);
    return findDueReviewEventIds([...others, event]).has(eventId);
}
