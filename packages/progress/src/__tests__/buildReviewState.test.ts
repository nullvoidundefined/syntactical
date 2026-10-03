import { describe, expect, it } from 'vitest';

import { buildReviewState } from '../buildReviewState.js';

import { buildEvent } from './support/buildEvent.js';
import { fixtureEvents, fixtureMisconceptionOf } from './support/reviewFixtures.js';
import { shuffleWithSeed } from './support/shuffleWithSeed.js';

const SHUFFLE_COUNT = 20;

describe('buildReviewState', () => {
    it('replays the same events to the same review state whatever their arrival order', () => {
        const reversed = [...fixtureEvents].reverse();
        const expected = buildReviewState(fixtureEvents, fixtureMisconceptionOf);
        expect(buildReviewState(reversed, fixtureMisconceptionOf)).toEqual(expected);
        for (let seed = 1; seed <= SHUFFLE_COUNT; seed += 1) {
            expect(buildReviewState(shuffleWithSeed(fixtureEvents, seed), fixtureMisconceptionOf)).toEqual(expected);
        }
    });

    it('gives every missed question an item counting its answers from the first miss on', () => {
        const { questions } = buildReviewState(fixtureEvents, fixtureMisconceptionOf);
        expect(Object.keys(questions).sort()).toEqual(['py-easy-01', 'py-easy-02']);
        expect(questions['py-easy-01'].card.reps).toBe(3);
        // py-easy-02 was correct before its miss, so its item starts at the miss.
        expect(questions['py-easy-02'].card.reps).toBe(1);
    });

    it('creates a misconception item only from a miss on a tagged choice, and aggregates its questions after that', () => {
        const { misconceptions } = buildReviewState(fixtureEvents, fixtureMisconceptionOf);
        expect(Object.keys(misconceptions).sort()).toEqual(['python.is-vs-equals', 'python.mutable-default-args']);
        // One miss on py-easy-01, then two correct answers to it.
        expect(misconceptions['python.mutable-default-args'].card.reps).toBe(3);
        // py-easy-02 was correct before its miss, so only the miss counts.
        expect(misconceptions['python.is-vs-equals'].card.reps).toBe(1);
    });

    it('counts a repeated event once', () => {
        const once = buildReviewState(fixtureEvents, fixtureMisconceptionOf);
        expect(buildReviewState([...fixtureEvents, ...fixtureEvents], fixtureMisconceptionOf)).toEqual(once);
    });

    it('has no misconception item for a miss on an untagged choice', () => {
        const events = [buildEvent({ choiceIndex: 1, isCorrect: false, questionId: 'py-easy-01' })];
        expect(buildReviewState(events, fixtureMisconceptionOf).misconceptions).toEqual({});
    });
});
