// B-3.3: every email is trimmed, NFKC-normalized, and lowercased before any rate-limit key or lookup.
import { describe, expect, it } from 'vitest';

import { normalizeEmail } from '../../services/normalizeEmail.js';

const CANONICAL = 'foo@example.com';

describe('normalizeEmail', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeEmail('  Foo@Example.COM \t')).toBe(CANONICAL);
  });

  it('applies NFKC so compatibility forms collapse to one address', () => {
    expect(normalizeEmail('ｆｏｏ@example.com')).toBe(CANONICAL);
    expect(normalizeEmail('ﬁx@example.com')).toBe('fix@example.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail(' ＦOO@Example.com ');

    expect(normalizeEmail(once)).toBe(once);
    expect(once).toBe(CANONICAL);
  });
});
