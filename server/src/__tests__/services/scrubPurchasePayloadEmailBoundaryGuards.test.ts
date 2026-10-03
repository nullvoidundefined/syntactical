// B-59.1c guards (unlocked): the whole-address forms of the email that must keep matching once the
// match is bounded. `mailto:<email>`, `<email>` in angle brackets, `"Pat" <email>`, `<email>.` at a
// sentence end, and fullwidth or mixed-case copies are scrubbed, in values and in object keys. The
// user id rule stays a plain "contains".
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const HEX_BYTES = 4;

// Maps printable ASCII to its fullwidth compatibility form, which NFKC folds back.
function toFullwidth(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : char;
    })
    .join('');
}

// Alternates letter case so the copy differs from the stored lowercase form.
function mixCase(text: string): string {
  return Array.from(text)
    .map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()))
    .join('');
}

function buildIdentity(): { email: string; userId: string } {
  const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
  return { email: `${local}@example.test`, userId: randomUUID() };
}

function wholeAddressForms(email: string): Record<string, string> {
  return {
    bare: email,
    mailto: `mailto:${email}`,
    angle: `<${email}>`,
    displayName: `"Pat" <${email}>`,
    sentenceEnd: `Write to ${email}.`,
    sentenceMiddle: `Write to ${email}. Thanks`,
    comma: `${email}, someone-else@example.test`,
    parenthesized: `(${email})`,
    fullwidth: toFullwidth(email),
    mixedCase: mixCase(email),
    upperCaseMailto: `MAILTO:${email.toUpperCase()}`,
    secondOccurrence: `jo${email} or ${email}`,
  };
}

describe('scrubPurchasePayload email boundary guards (B-59.1c)', () => {
  it('scrubs every whole-address form of the email as a value', () => {
    const identity = buildIdentity();
    const forms = wholeAddressForms(identity.email);

    const scrubbed = scrubPurchasePayload({ event: forms }, identity);

    const expected = Object.fromEntries(Object.keys(forms).map((label) => [label, DELETED]));
    expect(scrubbed).toStrictEqual({ event: expected });
  });

  it('renames every whole-address form of the email as a key', () => {
    const identity = buildIdentity();
    const forms = wholeAddressForms(identity.email);
    const payload = Object.fromEntries(Object.entries(forms).map(([label, form]) => [form, label]));

    const scrubbed = scrubPurchasePayload(payload, identity) as Record<string, string>;

    expect(Object.values(scrubbed).sort()).toEqual(Object.keys(forms).sort());
    for (const key of Object.keys(scrubbed)) {
      expect(key.startsWith(DELETED)).toBe(true);
    }
    expect(JSON.stringify(scrubbed).toLowerCase()).not.toContain(identity.email);
  });

  it('still scrubs the user id wherever it occurs inside a longer string', () => {
    const identity = buildIdentity();
    const payload = { a: `jo${identity.userId}m`, [`x${identity.userId}.uk`]: 'kept-value' };

    const scrubbed = scrubPurchasePayload(payload, identity);

    expect(scrubbed).toStrictEqual({ a: DELETED, [DELETED]: 'kept-value' });
  });
});
