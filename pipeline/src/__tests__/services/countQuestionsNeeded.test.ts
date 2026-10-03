// Task 2.3: how many questions a topic still needs to reach the target.
import { describe, expect, it } from 'vitest';

import { TARGET_QUESTIONS_PER_TOPIC } from '../../services/gapFill/TARGET_QUESTIONS_PER_TOPIC.js';
import { countQuestionsNeeded } from '../../services/gapFill/countQuestionsNeeded.js';

describe('countQuestionsNeeded', () => {
    it('targets 10 questions per topic', () => {
        expect(TARGET_QUESTIONS_PER_TOPIC).toBe(10);
    });

    it.each([
        [0, 10],
        [7, 3],
        [9, 1],
        [10, 0],
        [14, 0],
    ])('a topic with %i questions requests %i', (count, expected) => {
        expect(countQuestionsNeeded(count)).toBe(expected);
    });
});
