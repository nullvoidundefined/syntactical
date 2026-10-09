// A manifest entry may carry category 'frontend', 'backend' or 'database'; a missing category
// is valid, and any other value rejects the manifest at that entry.
import { describe, expect, it } from 'vitest';

import { validateManifest } from '../validateManifest.js';

const VALID_HASH = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

function buildEntry(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    label: 'Python',
    glyph: 'PY',
    tagline: 'Indentation, iterables, and gotchas.',
    grammar: 'python',
    topics: [{ id: 'strings', label: 'Strings' }],
    misconceptions: [],
    banks: {
      easy: { path: `${id}/easy.json`, hash: VALID_HASH, access: 'free', contentVersion: 1, topicCounts: {} },
    },
    ...overrides,
  };
}

function buildManifest(entry: Record<string, unknown>): Record<string, unknown> {
  return { schemaVersion: 2, languages: [entry] };
}

describe('validateManifest category', () => {
  it('accepts an entry with no category', () => {
    const input = buildManifest(buildEntry('python'));
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
  });

  it.each([['frontend'], ['backend'], ['database']])('accepts category %s', (category) => {
    const input = buildManifest(buildEntry('python', { category }));
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
  });

  it.each([['Frontend'], ['devops'], [''], [null], [1], [['backend']], [{ category: 'backend' }]])(
    'rejects category %j at the entry',
    (category) => {
      const result = validateManifest(buildManifest(buildEntry('python', { category })));
      expect(result).toEqual({ isValid: false, rule: 'languages[0].category is invalid' });
    },
  );
});
