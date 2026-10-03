// B-59.1b: scrubPurchasePayload hardening. Keys inside PII attribute objects are scrubbed, renamed
// keys never collide and lose a value, PII attribute values clear whatever their type, a blank
// identity fails closed, depth is bounded, and an own `__proto__` key cannot pollute a prototype.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MAX_DEPTH = 64;

function buildIdentity(): { email: string; userId: string } {
  const localPart = `deleted-${randomUUID().slice(0, 8)}`;
  return { email: `${localPart}@example.test`, userId: randomUUID() };
}

// Builds `levels` nested objects linked by `child`; each holds a `marker` string, and the
// innermost one also holds `leaf`. The root object is level 1.
function buildChain(levels: number, leaf: string): Record<string, unknown> {
  let node: Record<string, unknown> = { marker: `level-${levels}`, leaf };
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = { marker: `level-${level}`, child: node };
  }
  return node;
}

describe('scrubPurchasePayload hardening (B-59.1b)', () => {
  it('checks and renames keys inside a $displayName, $email, or $phoneNumber attribute object', () => {
    const identity = buildIdentity();
    const payload = {
      $email: { value: 'x', [identity.email]: 'by-email', updated_at_ms: 1 },
      $displayName: { value: 'y', [`id:${identity.userId}`]: 'by-id' },
      $phoneNumber: { value: 'z', note: identity.userId, keep: 'kept' },
    };

    const scrubbed = scrubPurchasePayload(payload, identity);

    expect(scrubbed).toStrictEqual({
      $email: { value: DELETED, [DELETED]: 'by-email', updated_at_ms: 1 },
      $displayName: { value: DELETED, [DELETED]: 'by-id' },
      $phoneNumber: { value: DELETED, note: DELETED, keep: 'kept' },
    });
    expect(JSON.stringify(scrubbed)).not.toContain(identity.userId);
    expect(JSON.stringify(scrubbed)).not.toContain(identity.email);
  });

  it('gives a colliding renamed key the first free [deleted]-n name so no value is lost', () => {
    const identity = buildIdentity();

    const twoRenamed = scrubPurchasePayload(
      { [identity.email]: 'first', [identity.userId]: { note: identity.email } },
      identity,
    );
    expect(twoRenamed).toStrictEqual({
      [DELETED]: 'first',
      [`${DELETED}-1`]: { note: DELETED },
    });

    const literalFirst = scrubPurchasePayload(
      {
        [DELETED]: 'literal',
        [`${DELETED}-1`]: 'literal-1',
        [identity.email]: 'renamed-a',
        [`user:${identity.userId}`]: 'renamed-b',
      },
      identity,
    );
    expect(literalFirst).toStrictEqual({
      [DELETED]: 'literal',
      [`${DELETED}-1`]: 'literal-1',
      [`${DELETED}-2`]: 'renamed-a',
      [`${DELETED}-3`]: 'renamed-b',
    });
  });

  it('clears a PII attribute value whatever its type and keeps null as null', () => {
    const identity = buildIdentity();
    const payload = {
      plain: [
        { $email: 'someone' },
        { $email: 5550100 },
        { $displayName: true },
        { $phoneNumber: ['555', '0100'] },
        { $email: null },
      ],
      objects: [
        { $phoneNumber: { value: 5550100, updated_at_ms: 1 } },
        { $displayName: { value: false, updated_at_ms: 2 } },
        { $email: { value: ['a', 'b'], updated_at_ms: 3 } },
        { $email: { value: { nested: 'thing' }, updated_at_ms: 4 } },
        { $displayName: { value: null, updated_at_ms: 5 } },
        { $phoneNumber: { updated_at_ms: 6, note: identity.email } },
      ],
    };

    const scrubbed = scrubPurchasePayload(payload, identity);

    expect(scrubbed).toStrictEqual({
      plain: [
        { $email: DELETED },
        { $email: DELETED },
        { $displayName: DELETED },
        { $phoneNumber: DELETED },
        { $email: null },
      ],
      objects: [
        { $phoneNumber: { value: DELETED, updated_at_ms: 1 } },
        { $displayName: { value: DELETED, updated_at_ms: 2 } },
        { $email: { value: DELETED, updated_at_ms: 3 } },
        { $email: { value: DELETED, updated_at_ms: 4 } },
        { $displayName: { value: null, updated_at_ms: 5 } },
        { $phoneNumber: { updated_at_ms: 6, note: DELETED } },
      ],
    });
  });

  it('throws on an empty or whitespace-only email or userId instead of matching everything', () => {
    const identity = buildIdentity();
    const payload = { a: 'unrelated', b: identity.email };

    expect(() => scrubPurchasePayload(payload, { email: '', userId: identity.userId })).toThrow();
    expect(() =>
      scrubPurchasePayload(payload, { email: ' \t\n ', userId: identity.userId }),
    ).toThrow();
    expect(() => scrubPurchasePayload(payload, { email: identity.email, userId: '' })).toThrow();
    expect(() =>
      scrubPurchasePayload(payload, { email: identity.email, userId: '   ' }),
    ).toThrow();
  });

  it('replaces every subtree deeper than 64 levels with [deleted] and scrubs 5,000 levels', () => {
    const identity = buildIdentity();

    const atLimit = buildChain(MAX_DEPTH, 'kept');
    expect(scrubPurchasePayload(atLimit, identity)).toStrictEqual(buildChain(MAX_DEPTH, 'kept'));

    const deep = buildChain(5000, identity.email);
    let scrubbed: unknown;
    expect(() => {
      scrubbed = scrubPurchasePayload(deep, identity);
    }).not.toThrow();

    let expected: Record<string, unknown> = { marker: `level-${MAX_DEPTH}`, child: DELETED };
    for (let level = MAX_DEPTH - 1; level >= 1; level -= 1) {
      expected = { marker: `level-${level}`, child: expected };
    }
    expect(scrubbed).toStrictEqual(expected);
    expect(JSON.stringify(scrubbed)).not.toContain(identity.email);
  });

  it('keeps an own __proto__ key with its scrubbed value and leaves the prototype unchanged', () => {
    const identity = buildIdentity();
    const json =
      `{"__proto__":{"polluted":${JSON.stringify(identity.email)},"keep":"kept"},` +
      `"nested":{"__proto__":{"flag":"on"}},"a":1}`;
    const payload: unknown = JSON.parse(json);

    const scrubbed = scrubPurchasePayload(payload, identity) as Record<string, unknown>;

    expect(Object.getPrototypeOf(scrubbed)).toBe(Object.prototype);
    expect(Object.hasOwn(scrubbed, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(scrubbed, '__proto__')?.value).toStrictEqual({
      polluted: DELETED,
      keep: 'kept',
    });
    expect(scrubbed.a).toBe(1);
    expect('polluted' in scrubbed).toBe(false);

    const nested = scrubbed.nested as Record<string, unknown>;
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
    expect(Object.hasOwn(nested, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(nested, '__proto__')?.value).toStrictEqual({
      flag: 'on',
    });
    expect('flag' in nested).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
