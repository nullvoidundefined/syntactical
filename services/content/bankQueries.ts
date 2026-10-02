// The TanStack Query definition for one bank download, and the background
// prefetch run after each manifest refresh. Shared by the content provider
// and useQuestionBank, so neither imports the other.
import type { QueryClient } from '@tanstack/react-query';
import type { CachedBank } from './contentCache';
import type { BankEntry, Manifest } from './contentTypes';
import { loadQuestionBank } from './loadQuestionBank';

export type ContentAccess = {
  contentBaseUrl: string;
  baselineManifest: Manifest;
  readLocalBank: (language: string, difficulty: string) => CachedBank | null;
};

export function findBankEntry(
  manifest: Manifest,
  language: string,
  difficulty: string,
): BankEntry | undefined {
  const languageEntry = manifest.languages.find((entry) => entry.id === language);
  return (languageEntry?.banks as Record<string, BankEntry> | undefined)?.[difficulty];
}

function readCurrentHash(
  queryClient: QueryClient,
  access: ContentAccess,
  language: string,
  difficulty: string,
): string | undefined {
  const currentManifest =
    queryClient.getQueryData<Manifest | null>(['manifest']) ?? access.baselineManifest;
  return findBankEntry(currentManifest, language, difficulty)?.hash;
}

export function buildBankQuery(
  queryClient: QueryClient,
  access: ContentAccess,
  language: string,
  difficulty: string,
  entry: BankEntry,
) {
  return {
    queryKey: ['bank', language, difficulty, entry.hash],
    queryFn: () =>
      loadQuestionBank({
        language,
        difficulty,
        entry,
        contentBaseUrl: access.contentBaseUrl,
        isHashCurrent: (hash: string) =>
          readCurrentHash(queryClient, access, language, difficulty) === hash,
      }),
  };
}

export function prefetchChangedBanks(
  queryClient: QueryClient,
  manifest: Manifest,
  access: ContentAccess,
): void {
  for (const language of manifest.languages) {
    for (const [difficulty, entry] of Object.entries(language.banks)) {
      if (!entry || access.readLocalBank(language.id, difficulty)?.hash === entry.hash) continue;
      void queryClient.prefetchQuery(
        buildBankQuery(queryClient, access, language.id, difficulty, entry),
      );
    }
  }
}
