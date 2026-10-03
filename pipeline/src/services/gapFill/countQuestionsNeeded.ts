// How many more questions a topic needs to reach the target; never negative.
import { TARGET_QUESTIONS_PER_TOPIC } from './TARGET_QUESTIONS_PER_TOPIC.js';

export function countQuestionsNeeded(existingCount: number): number {
    return Math.max(0, TARGET_QUESTIONS_PER_TOPIC - existingCount);
}
