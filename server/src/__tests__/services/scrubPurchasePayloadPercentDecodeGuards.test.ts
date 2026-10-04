// B-59.1e guards: decoding never makes a non-carrying string change. A string with only malformed
// escapes, a string that decodes to something without the identity, and a string whose decoded form
// names a longer address are returned byte-identical (never replaced by their decoded form), and
// decoding never throws. These pass before B-59.1e and must keep passing after it.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const MATCH_ONLY = { clearPiiAttributes: false };
const SHORT_EMAIL = 'ann@x.co';

function buildIdentity(email: string): { email: string; userId: string } {
  return { email, userId: randomUUID() };
}

const MALFORMED_WITHOUT_IDENTITY = {
  invalidHex: 'discount%ZZ',
  lonePercent: '50% off',
  trailingPercent: 'rate=100%',
  truncatedEscape: 'code=%4',
  truncatedMultibyte: 'name=%E0%A4%A',
  invalidUtf8Run: 'x=%C3%28',
  loneContinuationByte: '%80%80',
  overlongEncoding: '%C0%AF',
};

const DECODABLE_WITHOUT_IDENTITY = {
  space: 'hello%20world',
  query: 'https://shop.example/r?ref%3Dspring%26plan%3Dannual',
  doubleEncoded: 'a%2520b',
  multibyte: 'caf%C3%A9',
  plusSign: 'a+b%2Bc',
};

describe('scrubPurchasePayload percent-decode guards (B-59.1e)', () => {
  it('returns strings with malformed escapes and no identity byte-identical, in both modes', () => {
    const identity = buildIdentity(SHORT_EMAIL);
    const payload = { event: { ...MALFORMED_WITHOUT_IDENTITY } };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(payload);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(payload);
  });

  it('returns decodable strings without the identity in their raw form, not their decoded form', () => {
    const identity = buildIdentity(SHORT_EMAIL);
    const payload = {
      event: { ...DECODABLE_WITHOUT_IDENTITY },
      keys: { 'hello%20world': 1, 'caf%C3%A9': 2 },
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(payload);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(payload);
    expect(Object.keys((scrubPurchasePayload(payload, identity) as typeof payload).keys)).toEqual([
      'hello%20world',
      'caf%C3%A9',
    ]);
  });

  it('keeps joann@x.com, joann%40x.com, and ann%40x.com when deleting ann@x.co, as values and keys', () => {
    const identity = buildIdentity(SHORT_EMAIL);
    const longer = ['joann@x.com', 'joann%40x.com', 'ann%40x.com', 'joann%2540x.com', '?email%3Dann%40x.com'];
    const payload = {
      aliases: [...longer],
      subscriber: Object.fromEntries(longer.map((value, index) => [value, index])),
    };

    // Match-only mode only: own and unlinked rows match loosely since B-59.7.
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(payload);
  });
});
