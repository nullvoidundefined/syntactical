// The bank entry for one difficulty of a language entry; undefined when the
// language has no bank at that difficulty. Own keys only, so a difficulty
// such as "constructor" never reads the prototype.
import type { BankEntry, LanguageEntry } from '@syntactical/content-schema';

export function findBankInLanguage(languageEntry: LanguageEntry, difficulty: string): BankEntry | undefined {
  const banks = languageEntry.banks as Partial<Record<string, BankEntry>>;
  return Object.hasOwn(banks, difficulty) ? banks[difficulty] : undefined;
}
