// B-35 review fix: the goal history is validated, so a bad goal, a bad from
// date, or two changes on one date fail loudly instead of deciding by order.
import { describe, expect, it } from 'vitest';

import { computeDailyProgress } from '../computeDailyProgress.js';
import { buildEvent } from './support/buildEvent.js';

function isNeverDue(): boolean {
    return false;
}

const EVENTS = [buildEvent({ answeredAt: '2026-10-02T12:00:00Z' })];

describe('computeDailyProgress goal history validation', () => {
    it('throws when two goal changes share a from date', () => {
        const history = [
            { from: '2026-10-02', goal: 50 },
            { from: '2026-10-02', goal: 10 },
        ];
        expect(() => computeDailyProgress(EVENTS, 'UTC', history, isNeverDue)).toThrow(RangeError);
    });

    it('throws on a goal that is not one of the daily goals', () => {
        for (const goal of [15, 0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
            const history = [{ from: '2026-10-01', goal }];
            expect(() => computeDailyProgress(EVENTS, 'UTC', history, isNeverDue)).toThrow(
                RangeError,
            );
        }
    });

    it('throws on a goal change whose from is not a YYYY-MM-DD calendar date', () => {
        for (const from of ['2026-02-30', '2026-10-1', '2026-10-01T00:00:00Z', 'today']) {
            const history = [{ from, goal: 10 }];
            expect(() => computeDailyProgress(EVENTS, 'UTC', history, isNeverDue)).toThrow(
                RangeError,
            );
        }
    });
});
