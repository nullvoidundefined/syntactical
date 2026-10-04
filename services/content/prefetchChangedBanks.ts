// The background prefetch run after each manifest refresh: downloads every
// free bank whose hash differs from the local copy. Does nothing without a
// content base URL. Paid banks are never fetched here: prefetchPaidBanks fetches
// them for an entitled owner only, so a guest's launch requests none.
import type { Manifest } from '@syntactical/content-schema';
import type { QueryClient } from '@tanstack/react-query';

import { logWarning } from '../../clients/logClient';

import { buildBankQuery } from './buildBankQuery';
import type { ContentAccess } from './types/ContentAccess';

export function prefetchChangedBanks(
  queryClient: QueryClient,
  manifest: Manifest,
  access: ContentAccess,
): void {
  if (access.contentBaseUrl === null) return;
  for (const language of manifest.languages) {
    const { banks, id } = language;
    for (const [difficulty, entry] of Object.entries(banks)) {
      if (!entry) continue;
      const { access: bankAccess, hash, path } = entry;
      if (bankAccess === 'paid' || access.readLocalBank(id, difficulty)?.hash === hash) continue;
      queryClient
        .prefetchQuery(buildBankQuery(queryClient, access, id, difficulty, entry))
        .catch((err: unknown) =>
          logWarning({ document: path, err }, 'content prefetch failed'),
        );
    }
  }
}
