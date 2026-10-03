// B-33 (XP part): XP comes from the answer event alone, scaled by the bank's
// difficulty, with a bonus only for a correct due review answer.
import { describe, expect, it } from 'vitest';

import { computeXp } from '../computeXp.js';
import { REVIEW_BONUS_XP, XP_BY_DIFFICULTY } from '../index.js';
import { buildEvent } from './support/buildEvent.js';

describe('computeXp', () => {
    it('gives a correct hard answer 3 XP', () => {
        expect(computeXp(buildEvent({ bankKey: 'python/hard' }), false)).toBe(3);
    });

    it('gives a correct medium answer 2 XP and a correct easy answer 1 XP', () => {
        expect(computeXp(buildEvent({ bankKey: 'python/medium' }), false)).toBe(2);
        expect(computeXp(buildEvent({ bankKey: 'python/easy' }), false)).toBe(1);
    });

    it('gives a wrong answer 0 XP at every difficulty', () => {
        for (const bankKey of ['python/easy', 'python/medium', 'python/hard']) {
            expect(computeXp(buildEvent({ bankKey, isCorrect: false }), false)).toBe(0);
        }
    });

    it('gives a correct due review on easy 2 XP', () => {
        const event = buildEvent({ bankKey: 'python/easy', roundKind: 'review' });
        expect(computeXp(event, true)).toBe(2);
    });

    it('gives a correct due review on hard 4 XP', () => {
        expect(computeXp(buildEvent({ bankKey: 'python/hard' }), true)).toBe(4);
    });

    it('gives a wrong due review 0 XP', () => {
        expect(computeXp(buildEvent({ isCorrect: false }), true)).toBe(0);
    });

    it('takes the bonus from isDueReview, not from the event roundKind', () => {
        const reviewRound = buildEvent({ bankKey: 'python/easy', roundKind: 'review' });
        expect(computeXp(reviewRound, false)).toBe(1);
        const bankRound = buildEvent({ bankKey: 'python/easy', roundKind: 'bank' });
        expect(computeXp(bankRound, true)).toBe(2);
    });

    it('gives a topic round answer XP from its language/difficulty bank key', () => {
        const event = buildEvent({ bankKey: 'python/medium', roundKind: 'topic' });
        expect(computeXp(event, false)).toBe(2);
    });

    it('throws on a correct answer whose bank key has no easy, medium, or hard difficulty', () => {
        expect(() => computeXp(buildEvent({ bankKey: 'python/expert' }), false)).toThrow(
            RangeError,
        );
        expect(() => computeXp(buildEvent({ bankKey: 'python' }), false)).toThrow(RangeError);
        expect(() => computeXp(buildEvent({ bankKey: 'python/toString' }), false)).toThrow(
            RangeError,
        );
    });
});

describe('XP constants', () => {
    it('scale XP by difficulty with a one point review bonus', () => {
        expect(XP_BY_DIFFICULTY).toEqual({ easy: 1, hard: 3, medium: 2 });
        expect(REVIEW_BONUS_XP).toBe(1);
    });
});
