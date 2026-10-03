// B-59.1d boundary characters: the email matches when the character before it is anything other
// than a letter, digit, `_`, `+`, `-`, or `.`. The RFC 5322 atext symbols `! $ % * ^ { | } ~` and
// the backtick are boundaries, so an email right after one of them is scrubbed, as a value and as
// a key, in the default and the match-only mode; the same symbols after the email end it too.
// The local-part characters stay non-boundaries, so `_<email>` and `+<email>` are kept.
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const HEX_BYTES = 4;
const MATCH_ONLY = { clearPiiAttributes: false };
const BOUNDARY_CHARACTERS = ['!', '$', '%', '*', '^', '{', '|', '}', '~', '`'];
const LOCAL_PART_CHARACTERS = ['_', '+', '-', '.', 'a', '7'];

function buildIdentity(): { email: string; userId: string } {
  return { email: `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.test`, userId: randomUUID() };
}

describe('scrubPurchasePayload boundary characters (B-59.1d)', () => {
  it.each(BOUNDARY_CHARACTERS)('scrubs a value with %s right before the email, in both modes', (character) => {
    const identity = buildIdentity();
    const payload = { before: `${character}${identity.email}`, after: `${identity.email}${character}`, kept: 'x' };
    const expected = { before: DELETED, after: DELETED, kept: 'x' };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual(expected);
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(expected);
  });

  it.each(BOUNDARY_CHARACTERS)('renames a key with %s right before the email, in both modes', (character) => {
    const identity = buildIdentity();
    const payload = { [`${character}${identity.email}`]: 1 };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({ [DELETED]: 1 });
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual({ [DELETED]: 1 });
  });

  it('scrubs the email after a percent sign when its local part starts with hex digits', () => {
    const identity = { email: 'ab12@example.test', userId: randomUUID() };
    const payload = { value: '%ab12@example.test' };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({ value: DELETED });
    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual({ value: DELETED });
  });

  it.each(LOCAL_PART_CHARACTERS)('keeps a value with the local-part character %s before the email', (character) => {
    const identity = buildIdentity();
    const payload = { value: `${character}${identity.email}` };

    expect(scrubPurchasePayload(payload, identity, MATCH_ONLY)).toStrictEqual(payload);
  });
});
