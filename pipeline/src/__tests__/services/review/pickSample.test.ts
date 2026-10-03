// The deterministic review sample: 10% rounded up, at least 3, stable, seeded by bank key.
import { describe, expect, it } from 'vitest';

import { pickSample } from '../../../services/review/pickSample.js';

function ids(count: number): string[] {
    return Array.from({ length: count }, (_, index) => `q-${index}`);
}

describe('pickSample', () => {
    it.each([
        [0, 0],
        [2, 2],
        [3, 3],
        [5, 3],
        [30, 3],
        [31, 4],
        [100, 10],
        [101, 11],
    ])('picks the right size for %i questions: %i', (count, expected) => {
        expect(pickSample('python/easy', ids(count))).toHaveLength(expected);
    });

    it('picks the same questions on every run and for any input order', () => {
        const forward = pickSample('python/easy', ids(100));
        expect(pickSample('python/easy', ids(100))).toEqual(forward);
        expect(pickSample('python/easy', ids(100).reverse())).toEqual(forward);
    });

    it('seeds by bank key, so two banks do not pick the same questions', () => {
        expect(pickSample('python/easy', ids(100))).not.toEqual(pickSample('python/hard', ids(100)));
    });

    it('picks only ids it was given, with no repeats', () => {
        const picked = pickSample('python/easy', ids(50));
        expect(new Set(picked).size).toBe(picked.length);
        expect(picked.every((id) => ids(50).includes(id))).toBe(true);
    });
});
