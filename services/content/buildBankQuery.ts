// The TanStack Query definition for one bank download. Shared by the
// content provider and useQuestionBank, so neither imports the other.
import type { QueryClient } from '@tanstack/react-query';

import { findBankEntry } from './findBankEntry';
import { loadQuestionBank } from './loadQuestionBank';
import type { BankEntry } from './types/BankEntry';
import type { ContentAccess } from './types/ContentAccess';
import type { Manifest } from './types/Manifest';

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
  const { contentBaseUrl } = access;
  return {
    enabled: contentBaseUrl !== null,
    queryFn: () => {
      if (contentBaseUrl === null) return Promise.reject(new Error('no content base URL'));
      return loadQuestionBank({
        contentBaseUrl,
        difficulty,
        entry,
        isHashCurrent: (hash: string) =>
          readCurrentHash(queryClient, access, language, difficulty) === hash,
        language,
      });
    },
    queryKey: ['bank', language, difficulty, entry.hash],
  };
}
