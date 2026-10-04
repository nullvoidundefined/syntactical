// The TanStack Query definition for one bank download. Shared by the
// content provider and useQuestionBank, so neither imports the other. A paid
// bank's key also names its owner, so one account's download is never served
// from the query cache to another account on the same device.
import { buildBankContext } from '@syntactical/content-schema';
import type { BankEntry, Manifest } from '@syntactical/content-schema';
import type { QueryClient } from '@tanstack/react-query';

import { findBankEntry } from './findBankEntry';
import { loadQuestionBank } from './loadQuestionBank';
import type { ContentAccess } from './types/ContentAccess';

function readCurrentManifest(queryClient: QueryClient, access: ContentAccess): Manifest {
  return queryClient.getQueryData<Manifest | null>(['manifest']) ?? access.baselineManifest;
}

function readCurrentHash(
  queryClient: QueryClient,
  access: ContentAccess,
  language: string,
  difficulty: string,
): string | undefined {
  return findBankEntry(readCurrentManifest(queryClient, access), language, difficulty)?.hash;
}

// The ids a bank may reference come from its language's entry in the current manifest.
function readBankContext(queryClient: QueryClient, access: ContentAccess, language: string) {
  const languageEntry = readCurrentManifest(queryClient, access).languages.find(({ id }) => id === language);
  return languageEntry ? buildBankContext(languageEntry) : null;
}

export function buildBankQuery(
  queryClient: QueryClient,
  access: ContentAccess,
  language: string,
  difficulty: string,
  entry: BankEntry,
  ownerUserId: string | null = null,
) {
  const { contentBaseUrl } = access;
  const isPaid = entry.access === 'paid';
  return {
    enabled: isPaid ? ownerUserId !== null : contentBaseUrl !== null,
    queryFn: () => {
      if (!isPaid && contentBaseUrl === null) return Promise.reject(new Error('no content base URL'));
      const context = readBankContext(queryClient, access, language);
      if (context === null) return Promise.reject(new Error(`no manifest entry for ${language}`));
      return loadQuestionBank({
        contentBaseUrl,
        context,
        difficulty,
        entry,
        isHashCurrent: (hash: string) =>
          readCurrentHash(queryClient, access, language, difficulty) === hash,
        language,
        ownerUserId: isPaid ? ownerUserId : null,
      });
    },
    queryKey: isPaid ? ['bank', language, difficulty, entry.hash, ownerUserId] : ['bank', language, difficulty, entry.hash],
  };
}
