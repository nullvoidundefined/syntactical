import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as progress from '../index.js';
import { DAILY_GOALS, DEFAULT_DAILY_GOAL, findGoal } from '../index.js';

describe('findGoal', () => {
    const history = [
        { from: '2026-03-10', goal: 50 },
        { from: '2026-03-01', goal: 10 },
        { from: '2026-03-05', goal: 20 },
    ];

    it.each([
        ['2026-03-01', 10],
        ['2026-03-09', 20],
        ['2026-03-10', 50],
        ['2026-03-11', 50],
    ])('returns the latest goal on or before %s from unsorted history', (localDate, goal) => {
        expect(findGoal(history, localDate)).toBe(goal);
    });

    it('returns the earliest change’s goal for a date before every change', () => {
        expect(findGoal(history, '2026-02-28')).toBe(10);
    });

    it('throws RangeError for an empty history', () => {
        expect(() => findGoal([], '2026-03-10')).toThrow(RangeError);
    });
});

it('exports DEFAULT_DAILY_GOAL as 20 and an available daily goal', () => {
    expect(DEFAULT_DAILY_GOAL).toBe(20);
    expect(DAILY_GOALS).toContain(DEFAULT_DAILY_GOAL);
});

it.each(['isDueReview', 'orderAnswerEvents', 'newReviewItem', 'scheduleReview'])(
    'does not export %s as an own property',
    (name) => {
        expect(Object.prototype.hasOwnProperty.call(progress, name)).toBe(false);
    },
);

it('removes the unused isDueReview source file', () => {
    expect(existsSync(new URL('../isDueReview.ts', import.meta.url))).toBe(false);
});

it.each(['REVIEW_BONUS_XP', 'XP_BY_DIFFICULTY', 'PACKAGE_NAME'])('retains the public %s export', (name) => {
    expect(Object.prototype.hasOwnProperty.call(progress, name)).toBe(true);
});
