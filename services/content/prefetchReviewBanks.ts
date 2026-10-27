// Downloads each named bank that the manifest lists and the device has no local copy of (cached, bundled, or
// downloaded this session), so due reviews from it are not skipped. Does nothing without a content base URL.
import type { Manifest } from '@syntactical/content-schema';
import type { QueryClient } from '@tanstack/react-query';

import { logWarning } from '../../clients/logClient';

import { buildBankQuery } from './buildBankQuery';
import { findBankEntry } from './findBankEntry';
import type { ContentAccess } from './types/ContentAccess';

export function prefetchReviewBanks(
  queryClient: QueryClient,
  manifest: Manifest,
  access: ContentAccess,
  bankKeys: readonly string[],
): void {
  if (access.contentBaseUrl === null) return;
  for (const bankKey of bankKeys) {
    const [language, difficulty] = bankKey.split('/');
    if (!language || !difficulty) continue;
    const entry = findBankEntry(manifest, language, difficulty);
    if (!entry || access.readLocalBank(language, difficulty)) continue;
    queryClient
      .prefetchQuery(buildBankQuery(queryClient, access, language, difficulty, entry))
      .catch((err: unknown) => logWarning({ document: entry.path, err }, 'review bank prefetch failed'));
  }
}
