import type { LanguageEntry } from '@syntactical/content-schema';

import { findBankInLanguage } from '../findBankInLanguage';

const language: LanguageEntry = {
  id: 'python',
  label: 'Python',
  glyph: '🐍',
  tagline: 'Learn Python',
  grammar: 'python',
  topics: [],
  misconceptions: [],
  banks: {
    easy: {
      path: 'python/easy.json',
      hash: 'a'.repeat(64),
      access: 'free',
      contentVersion: 1,
      topicCounts: { loops: 3 },
    },
  },
};

describe('findBankInLanguage', () => {
  it('returns the bank for an available difficulty', () => {
    expect(findBankInLanguage(language, 'easy')).toBe(language.banks.easy);
  });

  it.each(['hard', 'constructor', '__proto__'])('returns undefined for %s', (difficulty) => {
    expect(findBankInLanguage(language, difficulty)).toBeUndefined();
  });
});
