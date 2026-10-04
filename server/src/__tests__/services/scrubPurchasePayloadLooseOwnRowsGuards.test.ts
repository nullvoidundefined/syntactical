// B-59.7 guards (pass today, unlocked): match-only mode (`clearPiiAttributes: false`, rows linked to
// another user) keeps the strict whole-address rule, so text glued to the email is kept while a
// sentence-end `ann@x.co.` still matches; and the default mode still keeps strings that do not hold
// the normalized email at all.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MATCH_ONLY = { clearPiiAttributes: false };
const SPEC_EMAIL = 'ann@x.co';

function specIdentity(): { email: string; userId: string } {
  return { email: SPEC_EMAIL, userId: randomUUID() };
}

describe('scrubPurchasePayload loose match guards (B-59.7)', () => {
  it('keeps xann@x.co, ann@x.co-INITIAL_PURCHASE, and joann@x.com in match-only mode, as values and keys', () => {
    const identity = specIdentity();
    const payload = {
      event: {
        letterBefore: 'xann@x.co',
        suffixEventType: 'ann@x.co-INITIAL_PURCHASE',
        longerAddress: 'joann@x.com',
        sentenceContinues: 'ann@x.co.Thanks',
        encodedLetterBefore: 'xann%40x.co',
      },
      keys: { 'xann@x.co': 1, 'ann@x.co-INITIAL_PURCHASE': 2, 'joann@x.com': 3 },
    };

    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(payload);
  });

  it('still matches ann@x.co. at a sentence end in match-only mode', () => {
    const identity = specIdentity();
    const payload = { note: 'Receipt sent to ann@x.co.', kept: 'xann@x.co' };

    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual({ note: DELETED, kept: 'xann@x.co' });
  });

  it('keeps strings that do not hold the normalized email anywhere, in the default mode', () => {
    const identity = specIdentity();
    const payload = {
      event: {
        shorterDomain: 'ann@x.c',
        shorterLocal: 'an@x.co',
        otherDomain: 'ann@y.co',
        spaceForAt: 'ann x.co',
        malformedEscape: 'ann%ZZx.co',
        productId: 'bank-advanced',
      },
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(payload);
  });
});
