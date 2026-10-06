// countPrintedValues groups a quoted string as one value whichever quote it uses: Python, Ruby,
// and SQL print strings in single quotes.
import { describe, expect, it } from 'vitest';

import { countPrintedValues } from '../../../services/gapFill/countPrintedValues.js';

describe('countPrintedValues', () => {
    it.each([
        ["'hello world'", 1],
        ['"hello world"', 1],
        ["['a b', 'c d']", 1],
        ["'it''s' 2", 2],
        ["'a' 'b' 'c'", 3],
        ['3 -1 3.5', 3],
        ["'C:\\' 'x'", 2],
    ])('counts %s as %i value(s)', (text, expected) => {
        expect(countPrintedValues(text)).toBe(expected);
    });
});
