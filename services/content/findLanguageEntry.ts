// The manifest entry for one language or track id, if the manifest lists it.
import type { LanguageEntry } from '@syntactical/content-schema';

export function findLanguageEntry(languages: readonly LanguageEntry[], language: string): LanguageEntry | undefined {
  return languages.find(({ id }) => id === language);
}
