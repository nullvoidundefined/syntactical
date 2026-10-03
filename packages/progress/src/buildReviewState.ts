// Rebuilds review state by replaying answer events through the scheduler
// in replay order. Every answered question gets an item. A wrong answer
// whose choice carries a misconception schedules that misconception as a
// miss and links the question to it; from then on a correct answer to a
// linked question counts as a correct review of each linked misconception,
// so a misconception item aggregates its questions' outcomes.
import { orderAnswerEvents } from './orderAnswerEvents.js';
import { newReviewItem, scheduleReview } from './scheduleReview.js';
import type { AnswerEvent } from './types/AnswerEvent.js';
import type { ReviewItem } from './types/ReviewItem.js';
import type { ReviewState } from './types/ReviewState.js';

type MisconceptionOf = (questionId: string, choiceIndex: number) => string | undefined;

function reviewItem(items: Record<string, ReviewItem>, id: string, isCorrect: boolean, at: string): void {
    items[id] = scheduleReview(items[id] ?? newReviewItem(id, at), isCorrect, at);
}

function readLinked(links: Map<string, Set<string>>, questionId: string): Set<string> {
    const linked = links.get(questionId) ?? new Set<string>();
    links.set(questionId, linked);
    return linked;
}

export function buildReviewState(events: readonly AnswerEvent[], misconceptionOf: MisconceptionOf): ReviewState {
    const questions: Record<string, ReviewItem> = {};
    const misconceptions: Record<string, ReviewItem> = {};
    const links = new Map<string, Set<string>>();
    for (const { answeredAt, choiceIndex, isCorrect, questionId } of orderAnswerEvents(events)) {
        reviewItem(questions, questionId, isCorrect, answeredAt);
        const linked = readLinked(links, questionId);
        if (isCorrect) {
            for (const misconceptionId of linked) {
                reviewItem(misconceptions, misconceptionId, true, answeredAt);
            }
            continue;
        }
        const misconceptionId = misconceptionOf(questionId, choiceIndex);
        if (misconceptionId !== undefined) {
            linked.add(misconceptionId);
            reviewItem(misconceptions, misconceptionId, false, answeredAt);
        }
    }
    return { misconceptions, questions };
}
