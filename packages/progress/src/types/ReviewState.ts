// The review state rebuilt from answer events: one item per answered
// question and one per misconception a learner has missed.
import type { ReviewItem } from './ReviewItem.js';

export type ReviewState = {
    misconceptions: Record<string, ReviewItem>;
    questions: Record<string, ReviewItem>;
};
