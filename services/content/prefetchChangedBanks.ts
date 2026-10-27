// The background prefetch run after each manifest refresh: refreshes every
// bank the device already has, bundled or cached, whose hash differs from the
// manifest's. A bank with no local copy (a Medium or Hard bank never opened
// on this device) is left to download on first use. Does nothing without a
// content base URL.
import type { Manifest } from '@syntactical/content-schema';
import type { QueryClient } from '@tanstack/react-query';

import { logWarning } from '../../clients/logClient';

import { buildBankQuery } from './buildBankQuery';
import type { ContentAccess } from './types/ContentAccess';

export function prefetchChangedBanks(queryClient: QueryClient, manifest: Manifest, access: ContentAccess): void {
  if (access.contentBaseUrl === null) return;
  for (const language of manifest.languages) {
    const { banks, id } = language;
    for (const [difficulty, entry] of Object.entries(banks)) {
      if (!entry) continue;
      const { hash, path } = entry;
      // readLocalBank is the cached bank, else the bundled one, else null.
      const localBank = access.readLocalBank(id, difficulty);
      if (!localBank || localBank.hash === hash) continue;
      queryClient
        .prefetchQuery(buildBankQuery(queryClient, access, id, difficulty, entry))
        .catch((err: unknown) => logWarning({ document: path, err }, 'content prefetch failed'));
    }
  }
}
