// A manifest entry may carry kind 'language' or 'topic'; a missing kind means 'language',
// and any other value rejects the manifest at that entry.
import { describe, expect, it } from 'vitest';

import { validateManifest } from '../validateManifest.js';

const VALID_HASH = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

function buildEntry(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    label: 'Backend Security',
    glyph: 'BSEC',
    tagline: 'Injection, auth, and server-side leaks.',
    grammar: 'plain',
    topics: [{ id: 'sql-injection', label: 'SQL injection' }],
    misconceptions: [],
    banks: {
      easy: { path: `${id}/easy.json`, hash: VALID_HASH, access: 'free', contentVersion: 1, topicCounts: {} },
      medium: {
        path: `${id}/medium.json`,
        hash: VALID_HASH,
        access: 'paid',
        productId: `syntactical.${id}.medium`,
        contentVersion: 1,
        topicCounts: {},
      },
    },
    ...overrides,
  };
}

function buildManifest(entry: Record<string, unknown>): Record<string, unknown> {
  return { schemaVersion: 2, languages: [entry] };
}

describe('validateManifest kind', () => {
  it('accepts an entry with no kind, unchanged', () => {
    const input = buildManifest(buildEntry('python', { grammar: 'python' }));
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
  });

  it("accepts kind 'language'", () => {
    const input = buildManifest(buildEntry('python', { grammar: 'python', kind: 'language' }));
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
  });

  it("accepts kind 'topic' on backend-security with grammar plain and a paid product id", () => {
    const input = buildManifest(buildEntry('backend-security', { kind: 'topic' }));
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
  });

  it.each([['Topic'], ['track'], [''], [null], [1], [['topic']], [{ kind: 'topic' }]])(
    'rejects kind %j at the entry',
    (kind) => {
      const result = validateManifest(buildManifest(buildEntry('backend-security', { kind })));
      expect(result).toEqual({ isValid: false, rule: 'languages[0].kind is invalid' });
    },
  );
});
