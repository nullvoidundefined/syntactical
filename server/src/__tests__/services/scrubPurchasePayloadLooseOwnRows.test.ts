// B-59.7: loose match in the deleted user's own and unlinked rows. In the default scrub mode
// (`clearPiiAttributes: true`), a string or key carries the identity when the normalized email occurs
// ANYWHERE in it, with no boundary rule, in the raw text or any percent-decoded form. So text glued
// to the email (`<email>-INITIAL_PURCHASE`, `x<email>`, `<email>.uk`) is replaced whole by
// `[deleted]`. The strict whole-address rule of match-only mode passes today and lives in the guards
// file.
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const HEX_BYTES = 4;
const SPEC_EMAIL = 'ann@x.co';

interface Identity {
  email: string;
  userId: string;
}

function buildIdentity(): Identity {
  const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
  return { email: `${local}@example.test`, userId: randomUUID() };
}

// Maps printable ASCII to its fullwidth compatibility form, which NFKC folds back.
function toFullwidth(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : char;
    })
    .join('');
}

// The B-59.7 examples for deleting ann@x.co: each holds the email only glued to other text.
function specGluedForms(): Record<string, string> {
  return {
    suffixEventType: 'ann@x.co-INITIAL_PURCHASE',
    sentenceContinues: 'ann@x.co.Thanks',
    letterBefore: 'xann@x.co',
    upperLetterBefore: 'XANN@X.CO',
    fullwidthLetterBefore: toFullwidth('xann@x.co'),
    encodedLetterBefore: 'xann%40x.co',
    longerLocalAndDomain: 'joann@x.com',
  };
}

// Strings where the email is glued to a local-part character before it or a domain continuation
// after it, so the strict rule keeps them.
function gluedForms(email: string): Record<string, string> {
  return {
    letter: `jo${email}`,
    digit: `7${email}`,
    underscore: `x_${email}`,
    plus: `tag+${email}`,
    hyphen: `x-${email}`,
    dot: `a.${email}`,
    domainLetter: `${email}m`,
    domainDot: `${email}.uk`,
    domainHyphen: `${email}-RENEWAL`,
    encodedGlued: `jo${email.replace('@', '%40')}m`,
  };
}

function deletedValues(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(labels).map((label) => [label, DELETED]));
}

describe('scrubPurchasePayload loose match in own and unlinked rows (B-59.7)', () => {
  it('replaces each B-59.7 glued form of ann@x.co as a value in the default mode', () => {
    const identity = { email: SPEC_EMAIL, userId: randomUUID() };
    const forms = specGluedForms();

    const scrubbed = scrubPurchasePayload({ event: { ...forms, product_id: 'bank-advanced' } }, identity);

    expect(scrubbed).toStrictEqual({ event: { ...deletedValues(forms), product_id: 'bank-advanced' } });
  });

  it('replaces the email glued to local-part characters or a domain continuation, inside arrays and nested objects', () => {
    const identity = buildIdentity();
    const forms = gluedForms(identity.email);
    const payload = {
      event: {
        forms,
        list: [...Object.values(forms), 'keep-me'],
        nested: { deeper: { note: `${identity.email}-INITIAL_PURCHASE`, price: 4.99 } },
      },
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({
      event: {
        forms: deletedValues(forms),
        list: [...Object.values(forms).map(() => DELETED), 'keep-me'],
        nested: { deeper: { note: DELETED, price: 4.99 } },
      },
    });
  });

  it('renames object keys that hold the email glued to other text, in the default mode', () => {
    const identity = { email: SPEC_EMAIL, userId: randomUUID() };
    const payload = {
      subscriber: {
        'ann@x.co-INITIAL_PURCHASE': 1,
        plain: 2,
        xann: 3,
        'xann@x.co': 4,
        'xann%40x.co': 5,
      },
    };

    expect(scrubPurchasePayload(payload, identity)).toStrictEqual({
      subscriber: {
        [DELETED]: 1,
        plain: 2,
        xann: 3,
        [`${DELETED}-1`]: 4,
        [`${DELETED}-2`]: 5,
      },
    });
  });
});
