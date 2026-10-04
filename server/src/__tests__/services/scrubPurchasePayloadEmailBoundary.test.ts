// B-59.1c: scrubPurchasePayload matches the email only as a whole address. An occurrence counts
// only when the character before it (if any) is not an address local-part character and the text
// after it (if any) does not continue the domain (a letter, digit, or hyphen, or a dot followed by
// a letter or digit). So `jo<email>`, `<email>m`, and `<email>.uk` name a different address and
// are kept, in values and in object keys, while a whole copy beside them is still scrubbed. Since B-59.7
// this strict rule applies to match-only mode (other users' rows); own and unlinked rows match loosely.
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const HEX_BYTES = 4;
const MATCH_ONLY = { clearPiiAttributes: false };

// Maps printable ASCII to its fullwidth compatibility form, which NFKC folds back.
function toFullwidth(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : char;
    })
    .join('');
}

function buildIdentity(): { email: string; userId: string } {
  const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
  return { email: `${local}@example.test`, userId: randomUUID() };
}

// Strings that contain the email but name a different address.
function longerAddresses(email: string): Record<string, string> {
  return {
    prefixed: `jo${email}`,
    suffixed: `${email}m`,
    subdomain: `${email}.uk`,
    dottedPrefix: `a.${email}`,
    plusPrefix: `tag+${email}`,
    hyphenPrefix: `x-${email}`,
    hyphenSuffix: `${email}-mirror`,
    digitSuffix: `${email}9`,
    digitAfterDot: `${email}.2`,
    upperPrefixed: `JO${email.toUpperCase()}`,
    fullwidthSuffixed: toFullwidth(`${email}m`),
    mailtoSubdomain: `mailto:${email}.uk`,
  };
}

describe('scrubPurchasePayload email boundary (B-59.1c)', () => {
  it('keeps a string value whose only email occurrence is part of a longer address', () => {
    const identity = buildIdentity();
    const values = longerAddresses(identity.email);
    const payload = { event: { ...values, whole: identity.email } };

    const scrubbed = scrubPurchasePayload(payload, identity, MATCH_ONLY);

    expect(scrubbed).toStrictEqual({ event: { ...values, whole: DELETED } });
  });

  it('keeps each of jo<email>, <email>m, and <email>.uk as a value inside arrays and nested objects', () => {
    const identity = buildIdentity();
    const { email } = identity;
    const payload = {
      aliases: [`jo${email}`, `${email}m`, `${email}.uk`, email],
      nested: { deeper: { contact: `jo${email}`, cc: [`${email}.uk`] } },
    };

    const scrubbed = scrubPurchasePayload(payload, identity, MATCH_ONLY);

    expect(scrubbed).toStrictEqual({
      aliases: [`jo${email}`, `${email}m`, `${email}.uk`, DELETED],
      nested: { deeper: { contact: `jo${email}`, cc: [`${email}.uk`] } },
    });
  });

  it('keeps an object key whose only email occurrence is part of a longer address', () => {
    const identity = buildIdentity();
    const values = longerAddresses(identity.email);
    const payload: Record<string, string> = {};
    for (const [label, key] of Object.entries(values)) {
      payload[key] = label;
    }
    payload[identity.email] = 'whole';

    const scrubbed = scrubPurchasePayload(payload, identity, MATCH_ONLY);

    const expected: Record<string, string> = {};
    for (const [label, key] of Object.entries(values)) {
      expected[key] = label;
    }
    expected[DELETED] = 'whole';
    expect(scrubbed).toStrictEqual(expected);
  });

  it('keeps jo<email>, <email>m, and <email>.uk keys in a nested object and does not rename them', () => {
    const identity = buildIdentity();
    const { email } = identity;
    const payload = {
      subscriber: {
        [`jo${email}`]: 1,
        [`${email}m`]: 2,
        [`${email}.uk`]: 3,
      },
    };

    const scrubbed = scrubPurchasePayload(payload, identity, MATCH_ONLY);

    expect(scrubbed).toStrictEqual(payload);
    expect(Object.keys((scrubbed as typeof payload).subscriber)).toEqual([
      `jo${email}`,
      `${email}m`,
      `${email}.uk`,
    ]);
  });
});
