// B-34: the day streak counts consecutive local dates with the goal met,
// ending today when today is met and yesterday while today is still open.
import { describe, expect, it } from 'vitest';

import { computeDayStreak } from '../computeDayStreak.js';
import type { DailyProgress } from '../types/DailyProgress.js';
import { shuffleWithSeed } from './support/shuffleWithSeed.js';

const SHUFFLE_COUNT = 100;

function met(localDate: string): DailyProgress {
    return { isGoalMet: true, localDate, xp: 20 };
}

function missed(localDate: string): DailyProgress {
    return { isGoalMet: false, localDate, xp: 5 };
}

describe('computeDayStreak', () => {
    it('counts consecutive met days ending today', () => {
        const progress = [met('2026-10-01'), met('2026-10-02'), met('2026-10-03')];
        expect(computeDayStreak(progress, '2026-10-03')).toBe(3);
    });

    it('resets after a day with progress below the goal', () => {
        const progress = [met('2026-10-01'), missed('2026-10-02'), met('2026-10-03')];
        expect(computeDayStreak(progress, '2026-10-03')).toBe(1);
    });

    it('resets after a day with no progress at all', () => {
        const progress = [met('2026-09-30'), met('2026-10-01'), met('2026-10-03')];
        expect(computeDayStreak(progress, '2026-10-03')).toBe(1);
    });

    it('keeps a streak that ended yesterday while today is not yet met', () => {
        const progress = [met('2026-10-01'), met('2026-10-02'), missed('2026-10-03')];
        expect(computeDayStreak(progress, '2026-10-03')).toBe(2);
    });

    it('keeps a streak that ended yesterday when today has no progress yet', () => {
        const progress = [met('2026-10-01'), met('2026-10-02')];
        expect(computeDayStreak(progress, '2026-10-03')).toBe(2);
    });

    it('is 0 when neither today nor yesterday is met', () => {
        const progress = [met('2026-09-30'), met('2026-10-01'), missed('2026-10-02')];
        expect(computeDayStreak(progress, '2026-10-03')).toBe(0);
        expect(computeDayStreak([], '2026-10-03')).toBe(0);
    });

    it('counts across month, year, and leap-day boundaries', () => {
        expect(computeDayStreak([met('2026-12-31'), met('2027-01-01')], '2027-01-01')).toBe(2);
        expect(computeDayStreak([met('2026-09-30'), met('2026-10-01')], '2026-10-01')).toBe(2);
        const leap = [met('2028-02-28'), met('2028-02-29'), met('2028-03-01')];
        expect(computeDayStreak(leap, '2028-03-01')).toBe(3);
    });

    it('ignores progress dated after today', () => {
        const progress = [met('2026-10-02'), met('2026-10-03'), met('2026-10-04')];
        expect(computeDayStreak(progress, '2026-10-03')).toBe(2);
    });

    it('throws on a today that is not a YYYY-MM-DD calendar date', () => {
        expect(() => computeDayStreak([], '2026-10-3')).toThrow(RangeError);
        expect(() => computeDayStreak([], '2026-02-30')).toThrow(RangeError);
        expect(() => computeDayStreak([], 'today')).toThrow(RangeError);
    });

    it('does not depend on progress order (100 seeded shuffles)', () => {
        const progress = [
            met('2026-09-20'),
            missed('2026-09-21'),
            met('2026-09-22'),
            met('2026-09-23'),
            met('2026-09-24'),
            met('2026-09-25'),
            met('2026-09-26'),
            missed('2026-09-27'),
        ];
        expect(computeDayStreak(progress, '2026-09-27')).toBe(5);
        for (let seed = 1; seed <= SHUFFLE_COUNT; seed += 1) {
            expect(computeDayStreak(shuffleWithSeed(progress, seed), '2026-09-27')).toBe(5);
        }
    });
});
