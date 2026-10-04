// B-59.8: depth cap in match-only mode. In match-only mode (`clearPiiAttributes: false`, rows linked to
// another user), a container nested deeper than 64 levels is returned unchanged (the original subtree,
// same content), and it does not by itself make the payload count as carrying the identity. Only the
// default mode replaces deep subtrees with `[deleted]`; that half passes today and lives in the guards file.
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { carriesPurchaseIdentity } from '../../services/carriesPurchaseIdentity.js';
import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MATCH_ONLY = { clearPiiAttributes: false };
const DEEP_LEVELS = 100;
const VERY_DEEP_LEVELS = 5000;
const HEX_BYTES = 4;
const LEAF = 'kept';
const PII_ATTRIBUTE_KEYS = ['$email', '$displayName', '$phoneNumber'] as const;

function buildIdentity(): { email: string; userId: string } {
  const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
  return { email: `${local}@example.test`, userId: randomUUID() };
}

// Builds `levels` nested objects, each `{ marker, child }`; the innermost holds `note: leaf` instead of a
// child. The root object is level 1.
function buildChain(levels: number, leaf: string): Record<string, unknown> {
  let node: Record<string, unknown> = { marker: `level-${levels}`, note: leaf };
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = { marker: `level-${level}`, child: node };
  }
  return node;
}

// Builds `levels` nested objects, each `{ marker, [attributeKey]: next }`; the innermost holds `note: leaf`.
function buildAttributeChain(attributeKey: string, levels: number, leaf: string): Record<string, unknown> {
  let node: Record<string, unknown> = { marker: `level-${levels}`, note: leaf };
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = { marker: `level-${level}`, [attributeKey]: node };
  }
  return node;
}

// Builds `levels` nested arrays, each `[marker, next]`; the innermost is `[marker, leaf]`.
function buildArrayChain(levels: number, leaf: string): unknown[] {
  let node: unknown[] = [`level-${levels}`, leaf];
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = [`level-${level}`, node];
  }
  return node;
}

describe('scrubPurchasePayload depth cap in match-only mode (B-59.8)', () => {
  it('returns a 100-level chain of nested objects with no identity unchanged in match-only mode', () => {
    const identity = buildIdentity();

    const scrubbed = scrubPurchasePayload(buildChain(DEEP_LEVELS, LEAF), identity, MATCH_ONLY);

    expect(scrubbed).toStrictEqual(buildChain(DEEP_LEVELS, LEAF));
    expect(JSON.stringify(scrubbed)).not.toContain(DELETED);
  });

  it('returns a 100-level chain of nested arrays with no identity unchanged in match-only mode', () => {
    const identity = buildIdentity();

    const scrubbed = scrubPurchasePayload(buildArrayChain(DEEP_LEVELS, LEAF), identity, MATCH_ONLY);

    expect(scrubbed).toStrictEqual(buildArrayChain(DEEP_LEVELS, LEAF));
    expect(JSON.stringify(scrubbed)).not.toContain(DELETED);
  });

  it.each(PII_ATTRIBUTE_KEYS)(
    'returns a 100-level chain of nested %s attribute objects with no identity unchanged in match-only mode',
    (attributeKey) => {
      const identity = buildIdentity();

      const scrubbed = scrubPurchasePayload(buildAttributeChain(attributeKey, DEEP_LEVELS, LEAF), identity, MATCH_ONLY);

      expect(scrubbed).toStrictEqual(buildAttributeChain(attributeKey, DEEP_LEVELS, LEAF));
      expect(JSON.stringify(scrubbed)).not.toContain(DELETED);
    },
  );

  it('returns a 5,000-level chain unchanged in match-only mode without throwing', () => {
    const identity = buildIdentity();

    let scrubbed: unknown;
    expect(() => {
      scrubbed = scrubPurchasePayload(buildChain(VERY_DEEP_LEVELS, LEAF), identity, MATCH_ONLY);
    }).not.toThrow();

    // Compared as JSON text: a structural diff of a 5,000-level mismatch overflows the matcher's stack.
    expect(JSON.stringify(scrubbed)).toBe(JSON.stringify(buildChain(VERY_DEEP_LEVELS, LEAF)));
  });

  it('replaces a shallow identity value and keeps a deep sibling subtree unchanged in match-only mode', () => {
    const identity = buildIdentity();
    const payload = {
      event: {
        contact: identity.email,
        product_id: 'bank-advanced',
        tree: buildChain(DEEP_LEVELS, LEAF),
        list: buildArrayChain(DEEP_LEVELS, LEAF),
        subscriber_attributes: { $email: buildAttributeChain('$email', DEEP_LEVELS, LEAF) },
      },
    };

    const scrubbed = scrubPurchasePayload(payload, identity, MATCH_ONLY);

    expect(scrubbed).toStrictEqual({
      event: {
        contact: DELETED,
        product_id: 'bank-advanced',
        tree: buildChain(DEEP_LEVELS, LEAF),
        list: buildArrayChain(DEEP_LEVELS, LEAF),
        subscriber_attributes: { $email: buildAttributeChain('$email', DEEP_LEVELS, LEAF) },
      },
    });
  });

  it('does not report a deep payload with no identity anywhere as carrying the identity', () => {
    const identity = buildIdentity();
    const payload = {
      event: {
        product_id: 'bank-advanced',
        tree: buildChain(DEEP_LEVELS, LEAF),
        list: buildArrayChain(DEEP_LEVELS, LEAF),
        subscriber_attributes: { $displayName: buildAttributeChain('$displayName', DEEP_LEVELS, LEAF) },
      },
    };

    expect(carriesPurchaseIdentity(payload, identity)).toBe(false);
    expect(carriesPurchaseIdentity(payload, identity, { isLoose: true })).toBe(false);
  });
});
