// B-33 review fix: a wrong answer earns 0 XP before its bank key is parsed,
// so one malformed key on a wrong answer cannot fail a whole day's progress.
import { expect, it } from 'vitest';

import { computeXp } from '../computeXp.js';
import { buildEvent } from './support/buildEvent.js';

it('gives a wrong answer 0 XP without reading its bank key', () => {
    for (const bankKey of ['python/expert', 'python', '', 'a/b/c']) {
        const event = buildEvent({ bankKey, isCorrect: false });
        expect(() => computeXp(event, false)).not.toThrow();
        expect(() => computeXp(event, true)).not.toThrow();
        expect(computeXp(event, false)).toBe(0);
        expect(computeXp(event, true)).toBe(0);
    }
});
