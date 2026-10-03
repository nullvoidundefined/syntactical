// The ids of every due review among answer events, in one replay: an event
// is a due review when it was answered in a review round for a question
// whose review item, rebuilt from that question's earlier events, was due
// at the time. A question's first answer is never a due review.
import { orderAnswerEvents } from './orderAnswerEvents.js';
import { newReviewItem, scheduleReview } from './scheduleReview.js';
import type { AnswerEvent } from './types/AnswerEvent.js';
import type { ReviewItem } from './types/ReviewItem.js';

export function findDueReviewEventIds(events: readonly AnswerEvent[]): Set<string> {
    const items = new Map<string, ReviewItem>();
    const dueEventIds = new Set<string>();
    for (const { answeredAt, eventId, isCorrect, questionId, roundKind } of orderAnswerEvents(events)) {
        const item = items.get(questionId);
        if (roundKind === 'review' && item !== undefined && item.card.due.getTime() <= Date.parse(answeredAt)) {
            dueEventIds.add(eventId);
        }
        items.set(questionId, scheduleReview(item ?? newReviewItem(questionId, answeredAt), isCorrect, answeredAt));
    }
    return dueEventIds;
}
