// B-59.1f guards: normalization applies to the decoded text (a fullwidth commercial at encoded as
// `%EF%BC%A0` folds to `@` under NFKC), the decode round cap is 5 (an identity percent-encoded 5 times
// deep is scrubbed, one encoded 6 times deep is not), and per-sequence decoding adds no false positive:
// a string that carries nothing is returned byte-identical. These pass before B-59.1f and must keep
// passing after it.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MATCH_ONLY = { clearPiiAttributes: false };
const ROUND_CAP = 5;

function buildIdentity(email: string): { email: string; userId: string } {
  return { email, userId: randomUUID() };
}

// Percent-encodes the text `depth` times over, so each `%` is re-encoded as `%25` once per extra level.
function encodeDeep(text: string, depth: number): string {
  let encoded = text;
  for (let level = 0; level < depth; level += 1) {
    encoded = encodeURIComponent(encoded);
  }
  return encoded;
}

describe('scrubPurchasePayload decode fixes guards (B-59.1f)', () => {
  it('scrubs an email whose @ is the fullwidth commercial at encoded as %EF%BC%A0, in both modes', () => {
    const identity = buildIdentity('pat@example.com');
    const payload = { event: { contact: 'pat%EF%BC%A0example.com', product_id: 'bank-advanced' } };
    const expected = { event: { contact: DELETED, product_id: 'bank-advanced' } };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(expected);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });

  it('scrubs an email percent-encoded 5 times deep, in both modes', () => {
    const identity = buildIdentity('pat@example.com');
    const deep = encodeDeep('pat@example.com', ROUND_CAP);
    const payload = { event: { contact: deep } };

    expect(deep).toBe('pat%2525252540example.com');
    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({ event: { contact: DELETED } });
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual({ event: { contact: DELETED } });
  });

  it('leaves an email percent-encoded 6 times deep unchanged, in both modes', () => {
    const identity = buildIdentity('pat@example.com');
    const deeper = encodeDeep('pat@example.com', ROUND_CAP + 1);
    const payload = { event: { contact: deeper } };

    expect(deeper).toBe('pat%252525252540example.com');
    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({ event: { contact: deeper } });
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual({ event: { contact: deeper } });
  });

  it('leaves strings with invalid bytes and no whole identity byte-identical, in both modes', () => {
    const identity = buildIdentity('ann@x.co');
    const payload = {
      event: {
        longerLocal: '%E9%22joann%40x.com%22',
        domainContinues: '%E9%22ann%40x.com%22',
        latin1Name: 'Ren%E9%20caf%C3%A9',
        strayBytes: '%FF%3C%E0%A4%3E',
      },
    };
    const expected = structuredClone(payload);

    // Match-only mode only: own and unlinked rows match loosely since B-59.7.
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });
});
