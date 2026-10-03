// B-59.1d guards (pass before the fix): nested arrays 5,000 deep are capped at level 64 without
// throwing, and a renamed identity key that comes before a literal `[deleted]` key takes
// `[deleted]-1` while the literal keeps its value.
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MAX_DEPTH = 64;
const DEEP_LEVELS = 5000;
const HEX_BYTES = 4;

function buildIdentity(): { email: string; userId: string } {
  const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
  return { email: `${local}@example.test`, userId: randomUUID() };
}

// Builds `levels` nested arrays, each `[marker, next]`; the innermost is `[marker, leaf]`. The root
// array is level 1.
function buildArrayChain(levels: number, leaf: string): unknown[] {
  let node: unknown[] = [`level-${levels}`, leaf];
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = [`level-${level}`, node];
  }
  return node;
}

describe('scrubPurchasePayload fixes guards (B-59.1d)', () => {
  it('caps a 5,000-level chain of nested arrays at level 64 without throwing', () => {
    const identity = buildIdentity();

    const atLimit = buildArrayChain(MAX_DEPTH, 'kept');
    expect(scrubPurchasePayload(atLimit, identity)).toStrictEqual(buildArrayChain(MAX_DEPTH, 'kept'));

    const deep = buildArrayChain(DEEP_LEVELS, identity.email);
    let scrubbed: unknown;
    expect(() => {
      scrubbed = scrubPurchasePayload(deep, identity);
    }).not.toThrow();

    let expected: unknown[] = [`level-${MAX_DEPTH}`, DELETED];
    for (let level = MAX_DEPTH - 1; level >= 1; level -= 1) {
      expected = [`level-${level}`, expected];
    }
    expect(scrubbed).toStrictEqual(expected);
    expect(JSON.stringify(scrubbed)).not.toContain(identity.email);
  });

  it('gives a renamed key that precedes a literal [deleted] key the name [deleted]-1 and keeps the literal value', () => {
    const identity = buildIdentity();
    const payload = {
      [identity.email]: 'renamed-by-email',
      [DELETED]: 'literal',
      nested: { [`user:${identity.userId}`]: 'renamed-by-id', [DELETED]: 'nested-literal' },
    };

    const scrubbed = scrubPurchasePayload(payload, identity);

    expect(scrubbed).toStrictEqual({
      [`${DELETED}-1`]: 'renamed-by-email',
      [DELETED]: 'literal',
      nested: { [`${DELETED}-1`]: 'renamed-by-id', [DELETED]: 'nested-literal' },
    });
  });
});
