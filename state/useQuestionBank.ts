// One bank's load state. A local copy (cached or bundled) whose hash
// matches the manifest is used directly; otherwise the bank downloads from
// the content host, keyed by its hash so overlapping requests share one
// fetch. Only Easy banks are bundled, so a Medium or Hard bank with no cached
// copy is loading while it downloads and an error with Retry when it fails.
// A first download (no local copy at all) waits until the manifest refresh
// has settled, so it starts once, under the hash the refreshed manifest names.
// Before the provider has read the cache only bundled content is known, so a bank
// is ready from its bundled copy or loading, never unknown, and nothing downloads.
import type { BankEntry, CachedBank } from '@syntactical/content-schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { buildBankQuery } from '../services/content/buildBankQuery';
import { buildManifestQuery } from '../services/content/buildManifestQuery';
import { findBankEntry } from '../services/content/findBankEntry';

import { useContentContext } from './ContentProvider';
import { useLanguageManifest } from './useLanguageManifest';

export type QuestionBankState =
  | { bank: CachedBank; status: 'ready' }
  | { status: 'loading' }
  | { retry: () => void; status: 'error' }
  | { status: 'unknown' };

const PLACEHOLDER_ENTRY: BankEntry = {
  contentVersion: 0,
  hash: 'none',
  path: '',
  topicCounts: {},
};

export function useQuestionBank(language: string, difficulty: string): QuestionBankState {
  const queryClient = useQueryClient();
  const access = useContentContext();
  const manifest = useLanguageManifest();
  const entry = findBankEntry(manifest, language, difficulty);
  const localBank = access.readLocalBank(language, difficulty);
  const needsDownload = entry !== undefined && localBank?.hash !== entry.hash;
  const { status: manifestStatus } = useQuery(buildManifestQuery(access.contentBaseUrl, false));
  const isManifestPending = !localBank && access.contentBaseUrl !== null && manifestStatus === 'pending';
  const query = useQuery({
    ...buildBankQuery(queryClient, access, language, difficulty, entry ?? PLACEHOLDER_ENTRY),
    enabled: access.isHydrated && needsDownload && access.contentBaseUrl !== null && !isManifestPending,
  });
  const { data, isError } = query;
  if (!access.isHydrated) return localBank ? { bank: localBank, status: 'ready' } : { status: 'loading' };
  if (!entry) return { status: 'unknown' };
  if (needsDownload && data) return { bank: data, status: 'ready' };
  if (localBank) return { bank: localBank, status: 'ready' };
  if (isError) return { retry: () => void query.refetch(), status: 'error' };
  return { status: 'loading' };
}
