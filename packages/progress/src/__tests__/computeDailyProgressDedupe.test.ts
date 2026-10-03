// Review fix: events are deduplicated by eventId (first occurrence kept), so
// an event delivered twice never counts twice, in any order.
import { describe, expect, it } from 'vitest';

import { computeDailyProgress } from '../computeDailyProgress.js';
import type { AnswerEvent } from '../types/AnswerEvent.js';
import { buildEvent } from './support/buildEvent.js';
import { shuffleWithSeed } from './support/shuffleWithSeed.js';

const SHUFFLE_COUNT = 100;
const GOAL_TEN = [{ from: '2026-01-01', goal: 10 }];

function isNeverDue(): boolean {
    return false;
}

describe('computeDailyProgress event deduplication', () => {
    it('counts an event repeated with the same eventId once', () => {
        const event = buildEvent({ bankKey: 'python/hard', eventId: 'repeated' });
        const other = buildEvent({ bankKey: 'python/easy', eventId: 'other' });
        const events = [event, { ...event }, other];
        expect(computeDailyProgress(events, 'UTC', GOAL_TEN, isNeverDue)).toEqual([
            { isGoalMet: false, localDate: '2026-10-02', xp: 4 },
        ]);
    });

    it('gives the same result over 100 seeded shuffles with duplicates in the input', () => {
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
        function isDueReview(event: AnswerEvent): boolean {
            return event.roundKind === 'review' && event.eventId.endsWith('3');
        }
        const expected = computeDailyProgress(events, 'Pacific/Auckland', GOAL_TEN, isDueReview);
        const withDuplicates = [...events, ...events.filter((_, index) => index % 5 === 0)];
        for (let seed = 1; seed <= SHUFFLE_COUNT; seed += 1) {
            const shuffled = shuffleWithSeed(withDuplicates, seed);
            expect(computeDailyProgress(shuffled, 'Pacific/Auckland', GOAL_TEN, isDueReview)).toEqual(
                expected,
            );
        }
    });
});
