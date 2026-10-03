import { describe, expect, it } from 'vitest';

import { buildReviewState } from '../buildReviewState.js';
import { computeDailyProgress } from '../computeDailyProgress.js';
import { findDueReviewEventIds } from '../findDueReviewEventIds.js';
import { isDueReview } from '../isDueReview.js';

import { buildEvent } from './support/buildEvent.js';

const noMisconception = () => undefined;
const GOALS = [{ from: '2026-09-01', goal: 10 }];

describe('reviews only for missed questions (owner decision 2026-10-03)', () => {
    it('gives a question answered correctly with no prior miss no review item', () => {
        const events = [buildEvent({ answeredAt: '2026-09-20T10:00:00Z', eventId: 'e-1', isCorrect: true })];
        expect(buildReviewState(events, noMisconception).questions).toEqual({});
    });

    it('never treats a later review round answer to a never-missed question as a due review', () => {
        const firstCorrect = buildEvent({ answeredAt: '2026-09-20T10:00:00Z', eventId: 'e-1', isCorrect: true });
        const laterReview = buildEvent({ answeredAt: '2026-10-20T10:00:00Z', eventId: 'e-2', roundKind: 'review' });
        expect(isDueReview(laterReview, [firstCorrect])).toBe(false);
        const dueIds = findDueReviewEventIds([firstCorrect, laterReview]);
        expect(dueIds.size).toBe(0);
        const progress = computeDailyProgress([firstCorrect, laterReview], 'UTC', GOALS, ({ eventId }) => dueIds.has(eventId));
        expect(progress.map(({ xp }) => xp)).toEqual([1, 1]);
    });

    it('still gives a correct due review after a miss the review bonus', () => {
        const miss = buildEvent({ answeredAt: '2026-09-20T10:00:00Z', eventId: 'e-1', isCorrect: false });
        const review = buildEvent({ answeredAt: '2026-09-21T10:00:00Z', eventId: 'e-2', roundKind: 'review' });
        const dueIds = findDueReviewEventIds([miss, review]);
        expect([...dueIds]).toEqual(['e-2']);
        const progress = computeDailyProgress([miss, review], 'UTC', GOALS, ({ eventId }) => dueIds.has(eventId));
        expect(progress.map(({ xp }) => xp)).toEqual([0, 2]);
    });

    it('keeps scheduling a missed question after correct reviews push it out', () => {
        const events = [
            buildEvent({ answeredAt: '2026-09-20T10:00:00Z', eventId: 'e-1', isCorrect: false }),
            buildEvent({ answeredAt: '2026-09-21T10:00:00Z', eventId: 'e-2', roundKind: 'review' }),
        ];
        const { questions } = buildReviewState(events, noMisconception);
        expect(questions['question-1'].card.reps).toBe(2);
        expect(questions['question-1'].card.due.getTime()).toBeGreaterThan(Date.parse('2026-09-21T10:00:00Z'));
    });
});
