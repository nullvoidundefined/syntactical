// The review scheduler, a thin wrapper over ts-fsrs: a correct answer is
// graded Good and a wrong one Again. Fuzz stays off so every device and the
// server replay the same events to the same due dates.
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';

import type { ReviewItem } from './types/ReviewItem.js';

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
const { Again, Good } = Rating;

export function newReviewItem(id: string, at: string): ReviewItem {
    return { card: createEmptyCard(new Date(at)), id };
}

export function scheduleReview(item: ReviewItem, isCorrect: boolean, at: string): ReviewItem {
    const { card, id } = item;
    const { card: next } = scheduler.next(card, new Date(at), isCorrect ? Good : Again);
    return { card: next, id };
}
