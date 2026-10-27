// The expand step of the free-banks change: every bank is free, so a bank entry needs only path, hash,
// contentVersion, and topicCounts. Until the last free-banks task rejects them, `access` and `productId`
// are accepted and ignored, whatever they hold, so the shipped manifest and the fixtures that still carry
// them stay valid while their readers are removed one task at a time. Every other bank entry rule holds.
import { describe, expect, it } from 'vitest';

import { validateManifest } from '../validateManifest.js';

const VALID_HASH = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

function buildBank(difficulty: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { path: `python/${difficulty}.json`, hash: VALID_HASH, contentVersion: 1, topicCounts: {}, ...overrides };
}

const ALL_BANKS = { easy: buildBank('easy'), medium: buildBank('medium'), hard: buildBank('hard') };

function buildManifest(banks: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 2,
    languages: [
      {
        id: 'python',
        label: 'Python',
        glyph: 'PY',
        tagline: 'Runtime semantics, stdlib, and the sharp edges.',
        grammar: 'python',
        topics: [{ id: 'strings', label: 'Strings' }],
        misconceptions: [],
        banks,
      },
    ],
  };
}

describe('validateManifest while access and productId are retired but accepted', () => {
  it('accepts easy, medium, and hard banks that carry neither access nor productId, unchanged', () => {
    const input = buildManifest(ALL_BANKS);
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
  });

  it.each([
    ['medium', { access: 'paid', productId: 'syntactical.python.medium' }],
    ['easy', { access: 'free' }],
    ['medium', { access: 'paid', productId: 'syntactical.python.easy' }],
    ['hard', { access: 'free', productId: 'syntactical.python.hard' }],
    ['easy', { productId: 'syntactical.python.easy' }],
  ])('accepts a %s bank carrying %j, ignoring both keys', (difficulty, retired) => {
    const input = buildManifest({ ...ALL_BANKS, [difficulty]: buildBank(difficulty, retired) });
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
  });

  it('still applies the other bank entry rules to an entry that carries a retired key', () => {
    const stale = buildBank('hard', { access: 'paid', hash: '' });
    expect(validateManifest(buildManifest({ ...ALL_BANKS, hard: stale }))).toEqual({
      isValid: false,
      rule: 'languages[0].banks.hard.hash is invalid',
    });
  });
});
