// Finds the manifest entry for one language and difficulty, if it exists.
import type { BankEntry, Manifest } from '@syntactical/content-schema';

import { findBankInLanguage } from './findBankInLanguage';
import { findLanguageEntry } from './findLanguageEntry';

export function findBankEntry(manifest: Manifest, language: string, difficulty: string): BankEntry | undefined {
  const languageEntry = findLanguageEntry(manifest.languages, language);
  return languageEntry ? findBankInLanguage(languageEntry, difficulty) : undefined;
}
