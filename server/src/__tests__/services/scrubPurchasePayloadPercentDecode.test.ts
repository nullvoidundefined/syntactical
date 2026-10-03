// B-59.1e: decode, then match. The identity match also considers the percent-decoded forms of each
// string value and object key (decoded repeatedly until stable, malformed escapes left as they are),
// so an email or user id that appears only percent-encoded is scrubbed whole as `[deleted]`, in the
// default mode and in the match-only mode (`clearPiiAttributes: false`).
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const HEX_BYTES = 4;
const MATCH_ONLY = { clearPiiAttributes: false };

interface Identity {
  email: string;
  userId: string;
}

function buildIdentity(): Identity {
  const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
  return { email: `${local}@example.test`, userId: randomUUID() };
}

function encodeAt(email: string): string {
  return email.replace('@', '%40');
}

// Strings that carry the identity only once percent-decoded.
function encodedCarriers({ email, userId }: Identity): Record<string, string> {
  return {
    queryEquals: `?email%3D${email}`,
    queryEqualsLowerHex: `https://shop.example/r?email%3d${email}`,
    pathSlash: `/users%2F${email}`,
    quoted: `%22${email}%22`,
    fullyEncodedAt: encodeAt(email),
    fullyEncodedUri: encodeURIComponent(`mailto:${email}`),
    doubleEncodedAt: email.replace('@', '%2540'),
    userIdEncodedHyphen: `ref:${userId.replace('-', '%2D')}`,
    userIdAllHyphensEncoded: userId.replaceAll('-', '%2d'),
  };
}

// Strings with a malformed escape elsewhere that still carry the identity once the rest decodes.
function carriersBesideMalformedEscapes({ email }: Identity): Record<string, string> {
  return {
    invalidHex: `%ZZ&email%3D${email}`,
    loneTrailingPercent: `/users%2F${email}?x=%`,
    lonePercentFirst: `% off&to=%22${email}%22`,
    truncatedEscape: `${encodeAt(email)}&code=%4`,
    invalidUtf8Run: `%C3%28&email%3D${email}`,
    loneContinuationByte: `%80/users%2F${email}`,
  };
}

function deletedValues(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(labels).map((label) => [label, DELETED]));
}

describe('scrubPurchasePayload percent-decoded identity (B-59.1e)', () => {
  it('replaces string values that carry the email or id only percent-encoded, in the default mode', () => {
    const identity = buildIdentity();
    const carriers = encodedCarriers(identity);

    const scrubbed = scrubPurchasePayload({ event: carriers }, identity);

    expect(scrubbed).toStrictEqual({ event: deletedValues(carriers) });
  });

  it('replaces string values that carry the email or id only percent-encoded, in match-only mode', () => {
    const identity = buildIdentity();
    const carriers = encodedCarriers(identity);

    const scrubbed = scrubPurchasePayload({ event: carriers }, identity, MATCH_ONLY);

    expect(scrubbed).toStrictEqual({ event: deletedValues(carriers) });
  });

  it('scrubs the fully encoded pat%40example.com and the double-encoded pat%2540example.com for pat@example.com', () => {
    const identity = { email: 'pat@example.com', userId: randomUUID() };
    const payload = {
      aliases: ['pat%40example.com', 'pat%2540example.com', 'keep-me'],
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({
      aliases: [DELETED, DELETED, 'keep-me'],
    });
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual({
      aliases: [DELETED, DELETED, 'keep-me'],
    });
  });

  it('replaces encoded carriers inside arrays and nested objects and leaves their siblings byte-identical', () => {
    const identity = buildIdentity();
    const { email, userId } = identity;
    const payload = {
      event: {
        product_id: 'bank-advanced',
        redirects: [`?email%3D${email}`, 'https://shop.example/r?ref=a%20b', 42],
        nested: {
          deeper: {
            link: `/users%2F${email}`,
            note: 'discount%ZZ',
            ref: userId.replace('-', '%2D'),
          },
        },
      },
    };

    const expected = {
      event: {
        product_id: 'bank-advanced',
        redirects: [DELETED, 'https://shop.example/r?ref=a%20b', 42],
        nested: {
          deeper: { link: DELETED, note: 'discount%ZZ', ref: DELETED },
        },
      },
    };
    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(expected);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });

  it('renames object keys that carry the email or id only percent-encoded, in both modes', () => {
    const identity = buildIdentity();
    const { email, userId } = identity;
    const payload = {
      subscriber: {
        [`?email%3D${email}`]: 1,
        plain: 2,
        [encodeAt(email)]: 3,
        [userId.replace('-', '%2D')]: 4,
      },
    };

    const expected = {
      subscriber: {
        [DELETED]: 1,
        plain: 2,
        [`${DELETED}-1`]: 3,
        [`${DELETED}-2`]: 4,
      },
    };
    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(expected);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });

  it('still matches an encoded email when a malformed escape appears elsewhere in the string, in both modes', () => {
    const identity = buildIdentity();
    const carriers = carriersBesideMalformedEscapes(identity);

    expect(scrubPurchasePayload({ event: carriers }, identity)).toStrictEqual({
      event: deletedValues(carriers),
    });
    expect(scrubPurchasePayload({ event: carriers }, identity, MATCH_ONLY)).toStrictEqual({
      event: deletedValues(carriers),
    });
  });

  it('matches an encoded email after normalizing the decoded form (case and surrounding space)', () => {
    const identity = buildIdentity();
    const upperEncoded = encodeAt(identity.email).toUpperCase();
    const spacedEncoded = `%20%20${encodeAt(identity.email)}%20`;
    const payload = { upperEncoded, spacedEncoded };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({
      upperEncoded: DELETED,
      spacedEncoded: DELETED,
    });
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual({
      upperEncoded: DELETED,
      spacedEncoded: DELETED,
    });
  });
});
