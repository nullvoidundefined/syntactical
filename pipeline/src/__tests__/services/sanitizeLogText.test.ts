import { describe, expect, it } from 'vitest';

import { sanitizeLogText } from '../../services/sanitizeLogText.js';

const LIMIT = 400;

describe('sanitizeLogText', () => {
    it.each([
        ['a newline', 'a\nb'],
        ['a carriage return', 'a\rb'],
        ['a NUL', 'a\u0000b'],
        ['a line separator', 'a b'],
        ['a bidi override', 'a‮b'],
        ['a zero-width space', 'a​b'],
        ['a byte order mark', 'a﻿b'],
    ])('replaces %s with a space', (_name, text) => {
        expect(sanitizeLogText(text)).toBe('a b');
    });

    it('keeps ordinary text, including non-ASCII letters and emoji', () => {
        expect(sanitizeLogText('café \u{1F600} ok')).toBe('café \u{1F600} ok');
    });

    it('caps the length by code point and never cuts a surrogate pair in half', () => {
        const text = `${'a'.repeat(LIMIT - 1)}\u{1F600}\u{1F600}`;
        const result = sanitizeLogText(text);
        expect(Array.from(result)).toHaveLength(LIMIT);
        expect(result.endsWith('\u{1F600}')).toBe(true);
        // encodeURIComponent throws on a lone surrogate.
        expect(() => encodeURIComponent(result)).not.toThrow();
    });
});
