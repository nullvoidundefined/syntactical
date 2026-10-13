import { expect, it } from 'vitest';

import * as progress from '../index.js';

it('exports the progress functions and constants', () => {
    for (const name of [
        'computeXp',
        'computeDailyProgress',
        'computeDayStreak',
        'toLocalDate',
        'isLocalDate',
        'buildReviewState',
        'findDueReviewEventIds',
        'findGoal',
        'XP_BY_DIFFICULTY',
        'REVIEW_BONUS_XP',
        'DAILY_GOALS',
        'DEFAULT_DAILY_GOAL',
    ]) {
        expect(progress).toHaveProperty(name);
    }
});
