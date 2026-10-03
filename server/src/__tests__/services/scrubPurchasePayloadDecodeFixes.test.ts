// B-59.1f: decoding is per escape sequence, not all-or-nothing per run. Inside a run of `%XX` escapes,
// every maximal sub-sequence that forms valid UTF-8 decodes, and only the bytes that cannot form a valid
// character stay as their `%XX` text. So an invalid byte (a Latin-1 `%E9`, a truncated multibyte lead, a
// stray `%FF`) next to encoded separators no longer hides an encoded email: the string is scrubbed whole as
// `[deleted]` in the default mode and in match-only mode, the row predicate reports it, and nothing throws.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { carriesPurchaseIdentity } from '../../services/carriesPurchaseIdentity.js';
import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MATCH_ONLY = { clearPiiAttributes: false };
const EMAIL = 'pat@example.com';

function buildIdentity(): { email: string; userId: string } {
  return { email: EMAIL, userId: randomUUID() };
}

// Each carries pat@example.com only once the valid escapes beside an invalid byte decode.
const CARRIERS_BESIDE_INVALID_BYTES = {
  latin1BeforeAngleBrackets: 'Ren%E9%20%3Cpat%40example.com%3E',
  latin1BeforeQuotes: '%E9%22pat%40example.com%22',
  invalidByteInsideBrackets: '%3C%FF%3Cpat%40example.com%3E',
  truncatedMultibyteBeforeQuote: '%E0%A4%22pat%40example.com%22',
  validMultibyteThenInvalid: 'caf%C3%A9%E9%3D%22pat%40example.com',
};

function deletedValues(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(labels).map((label) => [label, DELETED]));
}

describe('scrubPurchasePayload per-sequence percent decoding (B-59.1f)', () => {
  it('scrubs Ren%E9%20%3Cpat%40example.com%3E and %E9%22pat%40example.com%22 in the default mode', () => {
    const identity = buildIdentity();
    const payload = {
      event: {
        product_id: 'bank-advanced',
        display: 'Ren%E9%20%3Cpat%40example.com%3E',
        quoted: '%E9%22pat%40example.com%22',
      },
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({
      event: { product_id: 'bank-advanced', display: DELETED, quoted: DELETED },
    });
  });

  it('scrubs Ren%E9%20%3Cpat%40example.com%3E and %E9%22pat%40example.com%22 in match-only mode', () => {
    const identity = buildIdentity();
    const payload = {
      event: {
        product_id: 'bank-advanced',
        display: 'Ren%E9%20%3Cpat%40example.com%3E',
        quoted: '%E9%22pat%40example.com%22',
      },
    };

    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual({
      event: { product_id: 'bank-advanced', display: DELETED, quoted: DELETED },
    });
  });

  it('scrubs every value whose valid escapes sit beside bytes that cannot form a character, in both modes', () => {
    const identity = buildIdentity();
    const payload = { event: CARRIERS_BESIDE_INVALID_BYTES };
    const expected = { event: deletedValues(CARRIERS_BESIDE_INVALID_BYTES) };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(expected);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });

  it('renames object keys that carry the email beside an invalid byte, in both modes', () => {
    const identity = buildIdentity();
    const payload = {
      subscriber: {
        plain: 1,
        ['Ren%E9%20%3Cpat%40example.com%3E']: 2,
      },
    };
    const expected = { subscriber: { plain: 1, [DELETED]: 2 } };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(expected);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });

  it('reports a payload carrying the email beside an invalid byte as carrying the identity', () => {
    const identity = buildIdentity();

    expect(carriesPurchaseIdentity({ event: { display: 'Ren%E9%20%3Cpat%40example.com%3E' } }, identity)).toBe(true);
    expect(carriesPurchaseIdentity({ event: { quoted: '%E9%22pat%40example.com%22' } }, identity)).toBe(true);
  });
});
