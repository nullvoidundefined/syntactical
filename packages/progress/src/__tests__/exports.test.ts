import { expect, it } from 'vitest';

import * as progress from '../index.js';

it('exports the progress functions and constants', () => {
    for (const name of [
        'computeXp',
        'computeDailyProgress',
        'computeDayStreak',
        'toLocalDate',
        'isLocalDate',
        'newReviewItem',
        'scheduleReview',
        'buildReviewState',
        'isDueReview',
        'findDueReviewEventIds',
        'orderAnswerEvents',
        'XP_BY_DIFFICULTY',
        'REVIEW_BONUS_XP',
        'DAILY_GOALS',
    ]) {
        expect(progress).toHaveProperty(name);
    }
});
