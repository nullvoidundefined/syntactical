// Downloads each named bank that the manifest lists and the device has no local copy of (cached, bundled, or
// downloaded this session), so due reviews from it are not skipped. Does nothing without a content base URL. A
// bank whose download failed waits REVIEW_BANK_RETRY_MS before it is asked for again, so an offline device or a
// hash mismatch does not refetch on every coarse clock tick.
import type { Manifest } from '@syntactical/content-schema';
import type { QueryClient } from '@tanstack/react-query';

import { logWarning } from '../../clients/logClient';

import { buildBankQuery } from './buildBankQuery';
import { findBankEntry } from './findBankEntry';
import type { ContentAccess } from './types/ContentAccess';

export const REVIEW_BANK_RETRY_MS = 5 * 60 * 1000;

export function prefetchReviewBanks(
  queryClient: QueryClient,
  manifest: Manifest,
  access: ContentAccess,
  bankKeys: readonly string[],
  now: number = Date.now(),
): void {
  if (access.contentBaseUrl === null) return;
  for (const bankKey of bankKeys) {
    const [language, difficulty] = bankKey.split('/');
    if (!language || !difficulty) continue;
    const entry = findBankEntry(manifest, language, difficulty);
    if (!entry || access.readLocalBank(language, difficulty)) continue;
    const query = buildBankQuery(queryClient, access, language, difficulty, entry);
    const state = queryClient.getQueryState(query.queryKey);
    if (state?.status === 'error' && now - state.errorUpdatedAt < REVIEW_BANK_RETRY_MS) continue;
    queryClient
      .prefetchQuery(query)
      .catch((err: unknown) => logWarning({ document: entry.path, err }, 'review bank prefetch failed'));
  }
}
