// B-59.10 guards: decoding the NFKC-normalized form adds no false positive. In match-only mode a
// fullwidth-encoded address that is not the whole email (`joann％４０x.co`, `ann％４０x.com`,
// `o％２７ann％４０x.co`) is kept, and in both modes a string holding a fullwidth percent sign but no
// identity is returned byte-identical. These pass before B-59.10 and must keep passing after it.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const MATCH_ONLY = { clearPiiAttributes: false };

function buildIdentity(): { email: string; userId: string } {
  return { email: 'ann@x.co', userId: randomUUID() };
}

describe('scrubPurchasePayload fullwidth percent escapes guards (B-59.10)', () => {
  it('keeps fullwidth-encoded addresses that are not the whole email, in match-only mode', () => {
    const identity = buildIdentity();
    const payload = {
      event: {
        glued: 'joann％４０x.co',
        domainContinues: 'ann％４０x.com',
        apostrophe: 'o％２７ann％４０x.co',
      },
    };

    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(payload);
  });

  it('returns a string with a fullwidth percent sign and no identity byte-identical, in both modes', () => {
    const identity = buildIdentity();
    const payload = {
      event: {
        note: '５０％ off',
        code: 'discount％ＺＺ',
        ref: 'a％２０b',
        lone: '％',
      },
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(payload);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(payload);
  });
});
