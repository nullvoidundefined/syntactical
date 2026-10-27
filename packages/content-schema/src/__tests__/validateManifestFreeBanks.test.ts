// packages/content-schema/src/__tests__/validateManifestFreeBanks.test.ts
// Every bank is free, so a bank entry carries path, hash, contentVersion, and topicCounts only. An entry that
// still carries `access` or `productId` (a stale pipeline output, or a manifest from before the import) is
// rejected with a rule naming the key, before any other rule.
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

describe('validateManifest with every bank free', () => {
  it('accepts easy, medium, and hard banks that carry neither access nor productId, unchanged', () => {
    const input = buildManifest(ALL_BANKS);
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
  });

  it.each([
    ['easy', 'access', 'free'],
    ['medium', 'access', 'paid'],
    ['hard', 'access', 'free'],
    ['medium', 'productId', 'syntactical.python.medium'],
    ['easy', 'productId', 'syntactical.python.easy'],
  ])('rejects a %s bank carrying %s %j with a rule naming the key', (difficulty, key, value) => {
    const input = buildManifest({ ...ALL_BANKS, [difficulty]: buildBank(difficulty, { [key]: value }) });
    expect(validateManifest(input)).toEqual({
      isValid: false,
      rule: `languages[0].banks.${difficulty}.${key} is not allowed`,
    });
  });

  it('names access first when a stale paid entry carries both keys', () => {
    const stale = buildBank('medium', { access: 'paid', productId: 'syntactical.python.medium' });
    expect(validateManifest(buildManifest({ ...ALL_BANKS, medium: stale }))).toEqual({
      isValid: false,
      rule: 'languages[0].banks.medium.access is not allowed',
    });
  });

  it('names the retired key before the hash rule, so a stale entry is reported for what is stale', () => {
    const stale = buildBank('hard', { access: 'paid', hash: '' });
    expect(validateManifest(buildManifest({ ...ALL_BANKS, hard: stale }))).toEqual({
      isValid: false,
      rule: 'languages[0].banks.hard.access is not allowed',
    });
  });
});
