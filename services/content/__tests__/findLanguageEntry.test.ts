import type { LanguageEntry } from '@syntactical/content-schema';

import { findLanguageEntry } from '../findLanguageEntry';

const language: LanguageEntry = {
  id: 'python',
  label: 'Python',
  glyph: '🐍',
  tagline: 'Learn Python',
  grammar: 'python',
  topics: [],
  misconceptions: [],
  banks: {},
};

describe('findLanguageEntry', () => {
  it('finds the entry by id', () => {
    const languages: readonly LanguageEntry[] = [{ ...language, id: 'other' }, language];
    expect(findLanguageEntry(languages, 'python')).toBe(language);
  });

  it('returns undefined for an unknown id', () => {
    expect(findLanguageEntry([language], 'unknown')).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(findLanguageEntry([], 'python')).toBeUndefined();
  });
});
