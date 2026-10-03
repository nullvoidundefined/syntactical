import { describe, expect, it } from 'vitest';

import { computeDailyProgress } from '../computeDailyProgress.js';
import { findDueReviewEventIds } from '../findDueReviewEventIds.js';
import { isDueReview } from '../isDueReview.js';

import { buildEvent } from './support/buildEvent.js';

const firstAnswer = buildEvent({ answeredAt: '2026-09-20T10:00:00Z', eventId: 'e-1', isCorrect: false });
const dueReview = buildEvent({ answeredAt: '2026-09-21T10:00:00Z', eventId: 'e-2', roundKind: 'review' });
const earlyReview = buildEvent({ answeredAt: '2026-09-20T10:00:30Z', eventId: 'e-3', roundKind: 'review' });

describe('isDueReview', () => {
    it('is true for a review round answer to a question that was due', () => {
        expect(isDueReview(dueReview, [firstAnswer])).toBe(true);
    });

    it('is false for the first answer to a question, even in a review round', () => {
        expect(isDueReview({ ...dueReview, eventId: 'e-9' }, [])).toBe(false);
    });

    it('is false for a review answer before the item came due', () => {
        expect(isDueReview(earlyReview, [firstAnswer])).toBe(false);
    });

    it('is false for a bank round answer to a due question', () => {
        expect(isDueReview({ ...dueReview, roundKind: 'bank' }, [firstAnswer])).toBe(false);
    });

    it('ignores later events and other questions in the log passed in', () => {
        const later = buildEvent({ answeredAt: '2026-09-21T09:00:00Z', eventId: 'e-0', questionId: 'question-2' });
        expect(isDueReview(dueReview, [firstAnswer, dueReview, later])).toBe(true);
        expect(isDueReview(firstAnswer, [firstAnswer, dueReview])).toBe(false);
    });
});

describe('findDueReviewEventIds with computeDailyProgress', () => {
    it('gives a correct due review the review bonus toward the daily goal', () => {
        const events = [firstAnswer, dueReview];
        const dueIds = findDueReviewEventIds(events);
        expect([...dueIds]).toEqual(['e-2']);
        const progress = computeDailyProgress(events, 'UTC', [{ from: '2026-09-01', goal: 10 }], ({ eventId }) => dueIds.has(eventId));
        expect(progress).toEqual([
            { isGoalMet: false, localDate: '2026-09-20', xp: 0 },
            { isGoalMet: false, localDate: '2026-09-21', xp: 2 },
        ]);
    });
});
