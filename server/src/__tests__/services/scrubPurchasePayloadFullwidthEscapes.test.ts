// B-59.10: percent-decoding is also applied to the NFKC-normalized form of each string, so escapes
// written with the fullwidth percent sign and fullwidth digits or letters (for example
// `ann％４０x.co`) decode and match, in the default mode and in match-only mode
// (`clearPiiAttributes: false`). A carrying string or key is replaced whole by `[deleted]`.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MATCH_ONLY = { clearPiiAttributes: false };
const EMAIL = 'ann@x.co';

interface Identity {
  email: string;
  userId: string;
}

function buildIdentity(): Identity {
  return { email: EMAIL, userId: randomUUID() };
}

// Strings that are a whole address (or hold the user id) only once NFKC-normalized and then
// percent-decoded, so they match in both modes.
function fullwidthCarriers({ userId }: Identity): Record<string, string> {
  return {
    fullwidthPercentAndDigits: 'ann％４０x.co',
    fullwidthPercentAsciiDigits: 'ann％40x.co',
    asciiPercentFullwidthDigits: 'ann%４０x.co',
    mailto: 'mailto:ann％４０x.co',
    angleBrackets: '<ann％４０x.co>',
    fullwidthUpperCase: 'ＡＮＮ％４０Ｘ.ＣＯ',
    doubleEncoded: 'ann％２５４０x.co',
    fullwidthEncodedSeparator: 'https://shop.example/r?email％３Ｄann％４０x.co',
    userIdFullwidthHyphen: `ref:${userId.replace('-', '％２Ｄ')}`,
    userIdAllHyphensFullwidthLower: userId.replaceAll('-', '％２ｄ'),
  };
}

function deletedValues(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(labels).map((label) => [label, DELETED]));
}

describe('scrubPurchasePayload fullwidth percent escapes (B-59.10)', () => {
  it('replaces string values that carry the email or id only as fullwidth escapes, in the default mode', () => {
    const identity = buildIdentity();
    const carriers = fullwidthCarriers(identity);

    expect(scrubPurchasePayload({ event: carriers }, identity)).toStrictEqual({
      event: deletedValues(carriers),
    });
  });

  it('replaces string values that carry the email or id only as fullwidth escapes, in match-only mode', () => {
    const identity = buildIdentity();
    const carriers = fullwidthCarriers(identity);

    expect(scrubPurchasePayload({ event: carriers }, identity, MATCH_ONLY)).toStrictEqual({
      event: deletedValues(carriers),
    });
  });

  it('replaces a fullwidth-encoded carrier inside a nested payload and leaves its siblings byte-identical', () => {
    const identity = buildIdentity();
    const payload = {
      event: {
        product_id: 'bank-advanced',
        contacts: ['mailto:ann％４０x.co', 'mailto:bea％４０x.co', 42],
        nested: { deeper: { note: '５０％ off', link: 'ann％４０x.co' } },
      },
    };
    const expected = {
      event: {
        product_id: 'bank-advanced',
        contacts: [DELETED, 'mailto:bea％４０x.co', 42],
        nested: { deeper: { note: '５０％ off', link: DELETED } },
      },
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(expected);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });

  it('renames object keys that carry the email or id only as fullwidth escapes, in both modes', () => {
    const identity = buildIdentity();
    const payload = {
      subscriber: {
        'mailto:ann％４０x.co': 1,
        plain: 2,
        [identity.userId.replace('-', '％２Ｄ')]: 3,
      },
    };
    const expected = {
      subscriber: { [DELETED]: 1, plain: 2, [`${DELETED}-1`]: 3 },
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(expected);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });
});
