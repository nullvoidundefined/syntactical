// B-35 and B-34: daily progress sums each local day's XP in the user's
// timezone and marks the goal met against the goal in force on that day.
import { describe, expect, it } from 'vitest';

import { computeDailyProgress } from '../computeDailyProgress.js';
import { DAILY_GOALS } from '../index.js';
import type { AnswerEvent } from '../types/AnswerEvent.js';
import { buildEvent } from './support/buildEvent.js';
import { shuffleWithSeed } from './support/shuffleWithSeed.js';

const SHUFFLE_COUNT = 100;
const GOAL_TEN = [{ from: '2026-01-01', goal: 10 }];

function isNeverDue(): boolean {
    return false;
}

function buildEvents(answeredAt: string, count: number, bankKey = 'python/hard'): AnswerEvent[] {
    return Array.from({ length: count }, (_, index) =>
        buildEvent({ answeredAt, bankKey, eventId: `${answeredAt}-${bankKey}-${index}` }),
    );
}

describe('computeDailyProgress', () => {
    it('sums XP per local date in ascending date order', () => {
        const events = [
            buildEvent({ answeredAt: '2026-10-03T12:00:00Z', bankKey: 'python/hard', eventId: 'c' }),
            buildEvent({ answeredAt: '2026-10-02T12:00:00Z', bankKey: 'python/easy', eventId: 'a' }),
            buildEvent({ answeredAt: '2026-10-02T13:00:00Z', bankKey: 'python/medium', eventId: 'b' }),
        ];
        expect(computeDailyProgress(events, 'UTC', GOAL_TEN, isNeverDue)).toEqual([
            { isGoalMet: false, localDate: '2026-10-02', xp: 3 },
            { isGoalMet: false, localDate: '2026-10-03', xp: 3 },
        ]);
    });

    it('keeps a day with only wrong answers at 0 XP', () => {
        const events = [buildEvent({ isCorrect: false })];
        expect(computeDailyProgress(events, 'UTC', GOAL_TEN, isNeverDue)).toEqual([
            { isGoalMet: false, localDate: '2026-10-02', xp: 0 },
        ]);
    });

    it('returns no days for no events', () => {
        expect(computeDailyProgress([], 'UTC', GOAL_TEN, isNeverDue)).toEqual([]);
    });

    it('buckets by the local date in the user timezone (Review Focus 2)', () => {
        const events = [
            buildEvent({ answeredAt: '2026-10-02T10:55:00Z', bankKey: 'python/hard', eventId: 'x' }),
            buildEvent({ answeredAt: '2026-10-02T11:05:00Z', bankKey: 'python/hard', eventId: 'y' }),
        ];
        expect(computeDailyProgress(events, 'Pacific/Auckland', GOAL_TEN, isNeverDue)).toEqual([
            { isGoalMet: false, localDate: '2026-10-02', xp: 3 },
            { isGoalMet: false, localDate: '2026-10-03', xp: 3 },
        ]);
    });

    it('marks the goal met when the day XP reaches the goal exactly', () => {
        const events = [
            ...buildEvents('2026-10-02T12:00:00Z', 3),
            ...buildEvents('2026-10-02T12:00:00Z', 1, 'python/easy'),
        ];
        expect(computeDailyProgress(events, 'UTC', GOAL_TEN, isNeverDue)).toEqual([
            { isGoalMet: true, localDate: '2026-10-02', xp: 10 },
        ]);
    });

    it('adds the review bonus for events the predicate marks as due reviews', () => {
        const events = [
            buildEvent({ eventId: 'due', roundKind: 'review' }),
            buildEvent({ eventId: 'not-due', roundKind: 'review' }),
        ];
        function isDueReview(event: AnswerEvent): boolean {
            return event.eventId === 'due';
        }
        expect(computeDailyProgress(events, 'UTC', GOAL_TEN, isDueReview)).toEqual([
            { isGoalMet: false, localDate: '2026-10-02', xp: 3 },
        ]);
    });

    it('applies a goal change only on and after its from date', () => {
        const history = [
            { from: '2026-10-01', goal: 10 },
            { from: '2026-10-03', goal: 50 },
        ];
        const events = [
            ...buildEvents('2026-10-02T12:00:00Z', 4),
            ...buildEvents('2026-10-03T12:00:00Z', 4),
            ...buildEvents('2026-10-04T12:00:00Z', 17),
        ];
        expect(computeDailyProgress(events, 'UTC', history, isNeverDue)).toEqual([
            { isGoalMet: true, localDate: '2026-10-02', xp: 12 },
            { isGoalMet: false, localDate: '2026-10-03', xp: 12 },
            { isGoalMet: true, localDate: '2026-10-04', xp: 51 },
        ]);
    });

    it('applies a lowered goal from its from date on', () => {
        const history = [
            { from: '2026-10-01', goal: 50 },
            { from: '2026-10-03', goal: 20 },
        ];
        const events = [
            ...buildEvents('2026-10-02T12:00:00Z', 7),
            ...buildEvents('2026-10-03T12:00:00Z', 7),
        ];
        expect(computeDailyProgress(events, 'UTC', history, isNeverDue)).toEqual([
            { isGoalMet: false, localDate: '2026-10-02', xp: 21 },
            { isGoalMet: true, localDate: '2026-10-03', xp: 21 },
        ]);
    });

    it('reads the goal history by from date, not by array order', () => {
        const history = [
            { from: '2026-10-03', goal: 50 },
            { from: '2026-10-01', goal: 10 },
        ];
        const events = [
            ...buildEvents('2026-10-02T12:00:00Z', 4),
            ...buildEvents('2026-10-03T12:00:00Z', 4),
        ];
        expect(computeDailyProgress(events, 'UTC', history, isNeverDue)).toEqual([
            { isGoalMet: true, localDate: '2026-10-02', xp: 12 },
            { isGoalMet: false, localDate: '2026-10-03', xp: 12 },
        ]);
    });

    it('uses the earliest goal for a day before the first goal change', () => {
        const history = [{ from: '2026-10-05', goal: 20 }];
        const events = buildEvents('2026-10-02T12:00:00Z', 4);
        expect(computeDailyProgress(events, 'UTC', history, isNeverDue)).toEqual([
            { isGoalMet: false, localDate: '2026-10-02', xp: 12 },
        ]);
    });

    it('throws when there are events but no goal history', () => {
        expect(() => computeDailyProgress([buildEvent()], 'UTC', [], isNeverDue)).toThrow(
            RangeError,
        );
    });

    it('throws on an unknown timezone instead of falling back to UTC', () => {
        expect(() =>
            computeDailyProgress([buildEvent()], 'Not/A_Zone', GOAL_TEN, isNeverDue),
        ).toThrow(RangeError);
    });

    it('does not depend on event order (100 seeded shuffles)', () => {
        const banks = ['python/easy', 'python/medium', 'python/hard'];
        const events = Array.from({ length: 60 }, (_, index) =>
            buildEvent({
                answeredAt: new Date(Date.UTC(2026, 8, 25, index * 5, index)).toISOString(),
                bankKey: banks[index % banks.length],
                eventId: `event-${index}`,
                isCorrect: index % 4 !== 0,
                roundKind: index % 3 === 0 ? 'review' : 'bank',
            }),
        );
        const history = [
            { from: '2026-09-01', goal: 20 },
            { from: '2026-09-28', goal: 10 },
            { from: '2026-10-01', goal: 50 },
        ];
        function isDueReview(event: AnswerEvent): boolean {
            return event.roundKind === 'review' && event.eventId.endsWith('3');
        }
        const expected = computeDailyProgress(events, 'Pacific/Auckland', history, isDueReview);
        expect(expected.length).toBeGreaterThan(5);
        for (let seed = 1; seed <= SHUFFLE_COUNT; seed += 1) {
            const shuffledEvents = shuffleWithSeed(events, seed);
            const shuffledHistory = shuffleWithSeed(history, seed);
            expect(
                computeDailyProgress(shuffledEvents, 'Pacific/Auckland', shuffledHistory, isDueReview),
            ).toEqual(expected);
        }
    });
});

describe('DAILY_GOALS', () => {
    it('offers 10, 20, and 50 XP', () => {
        expect(DAILY_GOALS).toEqual([10, 20, 50]);
    });
});
