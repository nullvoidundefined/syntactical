import { expect, it } from 'vitest';

import { exitCodeFor } from '../../services/exitCodeFor.js';

it('exits 1 when any question failed', () => {
    expect(exitCodeFor({ failed: 2, 'not-executable': 0, passed: 5 })).toBe(1);
});

it('exits 0 when nothing failed, not-executable included', () => {
    expect(exitCodeFor({ failed: 0, 'not-executable': 3, passed: 5 })).toBe(0);
});

it('exits 0 when the failed count is absent', () => {
    expect(exitCodeFor({})).toBe(0);
});
