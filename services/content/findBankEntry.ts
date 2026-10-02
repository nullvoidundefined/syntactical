// Finds the manifest entry for one language and difficulty, if it exists.
import type { BankEntry, Manifest } from '@syntactical/content-schema';

export function findBankEntry(
  manifest: Manifest,
  language: string,
  difficulty: string,
): BankEntry | undefined {
  const languageEntry = manifest.languages.find((entry) => entry.id === language);
  const banks = languageEntry?.banks as Record<string, BankEntry> | undefined;
  return banks && Object.hasOwn(banks, difficulty) ? banks[difficulty] : undefined;
}
