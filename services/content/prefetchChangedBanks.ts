// The background prefetch run after each manifest refresh: downloads every
// bank whose hash differs from the local copy.
import type { QueryClient } from '@tanstack/react-query';

import { logWarning } from '../../clients/logClient';

import { buildBankQuery } from './buildBankQuery';
import type { ContentAccess } from './types/ContentAccess';
import type { Manifest } from './types/Manifest';

export function prefetchChangedBanks(
  queryClient: QueryClient,
  manifest: Manifest,
  access: ContentAccess,
): void {
  for (const language of manifest.languages) {
    const { banks, id } = language;
    for (const [difficulty, entry] of Object.entries(banks)) {
      if (!entry || access.readLocalBank(id, difficulty)?.hash === entry.hash) continue;
      queryClient
        .prefetchQuery(buildBankQuery(queryClient, access, id, difficulty, entry))
        .catch((err: unknown) =>
          logWarning({ document: entry.path, err }, 'content prefetch failed'),
        );
    }
  }
}
