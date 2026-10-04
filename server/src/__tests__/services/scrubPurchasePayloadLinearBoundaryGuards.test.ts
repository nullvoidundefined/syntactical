// B-59.11 guards (pass today, unlocked): reading the code point before an occurrence in O(1) must
// still see a whole astral character. An astral letter (U+1D400) directly before the email is a
// local-part character, so match-only mode keeps it; a surrogate pair elsewhere in the string, or
// one separated from the email by a space, does not stop a bounded email from being scrubbed. The
// spec's 10 kB near-miss case keeps its value here; its 50 ms bound is not asserted, because the
// prefix copy takes about 20 ms and crosses 50 ms under a parallel suite. The locked 200 kB case in
// scrubPurchasePayloadLinearBoundary.test.ts holds the same rate (1 s per 200 kB, 50 ms per 10 kB).
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MATCH_ONLY = { clearPiiAttributes: false };
const SPEC_EMAIL = 'ann@x.co';
const ASTRAL_LETTER = String.fromCodePoint(0x1d400);
const ASTRAL_SYMBOL = String.fromCodePoint(0x1f600);
const NEAR_MISS = 'xann@x.co ';
const SMALL_REPEATS = 1_000;

function specIdentity(): { email: string; userId: string } {
  return { email: SPEC_EMAIL, userId: randomUUID() };
}

describe('scrubPurchasePayload linear boundary guards (B-59.11)', () => {
  it('keeps an email directly after an astral letter, as a value and as a key', () => {
    const value = `${ASTRAL_LETTER}${SPEC_EMAIL}`;
    const payload = { astral: value, keys: { [value]: 1 } };

    expect(scrubPurchasePayload(payload, specIdentity(), MATCH_ONLY)).toStrictEqual({
      astral: value,
      keys: { [value]: 1 },
    });
  });

  it('scrubs an email directly after an astral symbol, which is not a local-part character', () => {
    const payload = { symbol: `${ASTRAL_SYMBOL}${SPEC_EMAIL}`, kept: 'x' };

    expect(scrubPurchasePayload(payload, specIdentity(), MATCH_ONLY)).toStrictEqual({ symbol: DELETED, kept: 'x' });
  });

  it('scrubs a bounded email when surrogate pairs appear elsewhere in the string', () => {
    const payload = {
      before: `${ASTRAL_LETTER}${ASTRAL_SYMBOL} ${SPEC_EMAIL}`,
      after: `${SPEC_EMAIL} ${ASTRAL_LETTER}`,
      kept: 'x',
    };

    expect(scrubPurchasePayload(payload, specIdentity(), MATCH_ONLY)).toStrictEqual({
      before: DELETED,
      after: DELETED,
      kept: 'x',
    });
  });

  it('keeps about 10 kB of repeated near-miss occurrences unchanged', () => {
    const text = NEAR_MISS.repeat(SMALL_REPEATS);

    expect(scrubPurchasePayload({ near: text }, specIdentity(), MATCH_ONLY)).toStrictEqual({ near: text });
  });
});
