// B-59.8 guards (pass before the fix): the default mode (own and unlinked rows) still replaces every
// container deeper than 64 levels with `[deleted]`, on object, array, and PII attribute chains, even when
// the payload carries no identity; and a deep payload whose email sits above the cap still carries it.
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { carriesPurchaseIdentity } from '../../services/carriesPurchaseIdentity.js';
import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MAX_DEPTH = 64;
const DEEP_LEVELS = 100;
const HEX_BYTES = 4;
const LEAF = 'kept';

function buildIdentity(): { email: string; userId: string } {
  const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
  return { email: `${local}@example.test`, userId: randomUUID() };
}

// Builds `levels` nested objects, each `{ marker, [childKey]: next }`; the innermost holds `note: leaf`.
// The root object is level 1.
function buildChain(childKey: string, levels: number, leaf: string): Record<string, unknown> {
  let node: Record<string, unknown> = { marker: `level-${levels}`, note: leaf };
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = { marker: `level-${level}`, [childKey]: node };
  }
  return node;
}

// The chain cut at level 64: the level-64 object's child is `[deleted]`.
function cappedChain(childKey: string): Record<string, unknown> {
  let node: Record<string, unknown> = { marker: `level-${MAX_DEPTH}`, [childKey]: DELETED };
  for (let level = MAX_DEPTH - 1; level >= 1; level -= 1) {
    node = { marker: `level-${level}`, [childKey]: node };
  }
  return node;
}

function buildArrayChain(levels: number, leaf: string): unknown[] {
  let node: unknown[] = [`level-${levels}`, leaf];
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = [`level-${level}`, node];
  }
  return node;
}

function cappedArrayChain(): unknown[] {
  let node: unknown[] = [`level-${MAX_DEPTH}`, DELETED];
  for (let level = MAX_DEPTH - 1; level >= 1; level -= 1) {
    node = [`level-${level}`, node];
  }
  return node;
}

describe('scrubPurchasePayload depth cap in the default mode guards (B-59.8)', () => {
  it.each(['child', '$email', '$displayName'])(
    'replaces a 100-level %s chain with no identity below level 64 in the default mode',
    (childKey) => {
      const identity = buildIdentity();

      expect(scrubPurchasePayload(buildChain(childKey, DEEP_LEVELS, LEAF), identity)).toStrictEqual(
        cappedChain(childKey),
      );
    },
  );

  it('replaces a 100-level array chain with no identity below level 64 in the default mode', () => {
    const identity = buildIdentity();

    expect(scrubPurchasePayload(buildArrayChain(DEEP_LEVELS, LEAF), identity)).toStrictEqual(cappedArrayChain());
  });

  it('reports a deep payload as carrying the identity when the email sits above the cap', () => {
    const identity = buildIdentity();
    const payload = { event: { contact: identity.email, tree: buildChain('child', DEEP_LEVELS, LEAF) } };

    expect(carriesPurchaseIdentity(payload, identity)).toBe(true);
  });
});
