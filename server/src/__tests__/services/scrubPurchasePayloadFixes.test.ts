// B-59.1d: scrubPurchasePayload fixes. The email matches after any character that is not a letter,
// digit, `_`, `+`, `-`, or `.` (so URL, query, path, fragment, and single-quoted forms are
// scrubbed), in values and keys; and the 64-level depth cap holds on chains of nested PII attribute
// objects. The collision and nested-array bullets pass today and live in the guards file.
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MAX_DEPTH = 64;
const DEEP_LEVELS = 5000;
const HEX_BYTES = 4;
const PII_ATTRIBUTE_KEYS = ['$email', '$displayName', '$phoneNumber'] as const;

function buildIdentity(): { email: string; userId: string } {
  const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
  return { email: `${local}@example.test`, userId: randomUUID() };
}

// Strings where the email is preceded by a boundary character under B-59.1d.
function boundedForms(email: string): Record<string, string> {
  return {
    query: `?email=${email}`,
    fullUrl: `https://shop.example.test/account?email=${email}&src=app`,
    path: `/users/${email}`,
    pathUrl: `https://shop.example.test/users/${email}/receipts`,
    ref: `ref=${email}`,
    ampersand: `a&${email}`,
    fragment: `#${email}`,
    singleQuoted: `'${email}'`,
    colonNoSpace: `contact:${email}`,
    upperQuery: `?EMAIL=${email.toUpperCase()}`,
  };
}

// Strings where the email is preceded by a local-part character, so it names another address.
function longerAddresses(email: string): Record<string, string> {
  return {
    letter: `jo${email}`,
    digit: `7${email}`,
    underscore: `x_${email}`,
    plus: `tag+${email}`,
    hyphen: `x-${email}`,
    dot: `a.${email}`,
  };
}

// Builds `levels` nested objects, each `{ marker, [attributeKey]: next }`; the innermost holds
// `note: leaf` instead of a child. The root object is level 1 (the hardening test's convention).
function buildAttributeChain(
  attributeKey: string,
  levels: number,
  leaf: string,
): Record<string, unknown> {
  let node: Record<string, unknown> = { marker: `level-${levels}`, note: leaf };
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = { marker: `level-${level}`, [attributeKey]: node };
  }
  return node;
}

describe('scrubPurchasePayload fixes (B-59.1d)', () => {
  it('scrubs the email after a URL, query, path, ref=, &, #, or quote boundary and keeps local-part prefixes', () => {
    const identity = buildIdentity();
    // Since B-59.9 the apostrophe is a local-part character, so `'<email>'` is kept in match-only mode.
    const { singleQuoted, ...bounded } = boundedForms(identity.email);
    const longer = { ...longerAddresses(identity.email), singleQuoted };
    const payload = { event: { bounded, longer, list: Object.values(bounded) } };

    // Match-only mode: since B-59.7 the local-part prefixes are kept only in other users' rows.
    const scrubbed = scrubPurchasePayload(payload, identity, { clearPiiAttributes: false });

    const allDeleted = Object.fromEntries(Object.keys(bounded).map((label) => [label, DELETED]));
    expect(scrubbed).toStrictEqual({
      event: {
        bounded: allDeleted,
        longer,
        list: Object.values(bounded).map(() => DELETED),
      },
    });
  });

  it('renames an object key holding the email after a URL, query, path, ref=, &, #, or quote boundary', () => {
    const identity = buildIdentity();
    const bounded = boundedForms(identity.email);
    const payload = Object.fromEntries(
      Object.entries(bounded).map(([label, form]) => [label, { [form]: label }]),
    );

    const scrubbed = scrubPurchasePayload(payload, identity);

    expect(scrubbed).toStrictEqual(
      Object.fromEntries(Object.keys(bounded).map((label) => [label, { [DELETED]: label }])),
    );
    expect(JSON.stringify(scrubbed)).not.toContain(identity.email);
  });

  it.each(PII_ATTRIBUTE_KEYS)(
    'caps a 5,000-level chain of nested %s attribute objects at level 64 without throwing',
    (attributeKey) => {
      const identity = buildIdentity();

      const atLimit = buildAttributeChain(attributeKey, MAX_DEPTH, 'kept');
      expect(scrubPurchasePayload(atLimit, identity)).toStrictEqual(
        buildAttributeChain(attributeKey, MAX_DEPTH, 'kept'),
      );

      const deep = buildAttributeChain(attributeKey, DEEP_LEVELS, identity.email);
      let scrubbed: unknown;
      expect(() => {
        scrubbed = scrubPurchasePayload(deep, identity);
      }).not.toThrow();

      let expected: Record<string, unknown> = { marker: `level-${MAX_DEPTH}`, [attributeKey]: DELETED };
      for (let level = MAX_DEPTH - 1; level >= 1; level -= 1) {
        expected = { marker: `level-${level}`, [attributeKey]: expected };
      }
      expect(scrubbed).toStrictEqual(expected);
      expect(JSON.stringify(scrubbed)).not.toContain(identity.email);
    },
  );
});
