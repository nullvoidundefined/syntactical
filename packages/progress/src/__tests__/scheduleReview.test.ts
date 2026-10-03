import { State } from 'ts-fsrs';
import { expect, it } from 'vitest';

import { newReviewItem, scheduleReview } from '../scheduleReview.js';

const DAY_MS = 86_400_000;

function buildLearnedItem() {
    const first = scheduleReview(newReviewItem('py-easy-01', '2026-09-20T10:00:00Z'), true, '2026-09-20T10:00:00Z');
    return scheduleReview(first, true, '2026-09-23T10:00:00Z');
}

it('starts a new item as a new card due at once', () => {
    const { card, id } = newReviewItem('py-easy-01', '2026-09-20T10:00:00Z');
    expect(id).toBe('py-easy-01');
    expect(card.state).toBe(State.New);
    expect(card.due.toISOString()).toBe('2026-09-20T10:00:00.000Z');
    expect(card.reps).toBe(0);
});

it('pushes a correct review further out and brings a miss back within a day', () => {
    const learned = buildLearnedItem();
    const previousGap = learned.card.due.getTime() - Date.parse('2026-09-23T10:00:00Z');
    const afterCorrect = scheduleReview(learned, true, learned.card.due.toISOString());
    expect(afterCorrect.card.due.getTime() - learned.card.due.getTime()).toBeGreaterThan(previousGap);
    const afterMiss = scheduleReview(learned, false, learned.card.due.toISOString());
    expect(afterMiss.card.due.getTime() - learned.card.due.getTime()).toBeLessThanOrEqual(DAY_MS);
    expect(afterMiss.card.lapses).toBe(learned.card.lapses + 1);
});

it('moves an item through the FSRS states: new, learning, review, then relearning after a miss', () => {
    const first = scheduleReview(newReviewItem('q', '2026-09-20T10:00:00Z'), true, '2026-09-20T10:00:00Z');
    expect(first.card.state).toBe(State.Learning);
    const learned = scheduleReview(first, true, '2026-09-23T10:00:00Z');
    expect(learned.card.state).toBe(State.Review);
    expect(scheduleReview(learned, false, learned.card.due.toISOString()).card.state).toBe(State.Relearning);
});

it('schedules the same answers to the same due date every time', () => {
    expect(buildLearnedItem().card.due.toISOString()).toBe(buildLearnedItem().card.due.toISOString());
});

it('leaves the input item unchanged', () => {
    const item = newReviewItem('q', '2026-09-20T10:00:00Z');
    scheduleReview(item, false, '2026-09-20T10:00:00Z');
    expect(item.card.reps).toBe(0);
});
