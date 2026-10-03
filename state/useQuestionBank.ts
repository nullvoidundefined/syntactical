// One bank's load state. A local copy (cached or bundled) whose hash
// matches the manifest is used directly; otherwise the bank downloads,
// keyed by its hash so overlapping requests share one fetch.
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { BankEntry, CachedBank } from '@syntactical/content-schema';

import { buildBankQuery } from '../services/content/buildBankQuery';
import { findBankEntry } from '../services/content/findBankEntry';

import { useContentContext } from './ContentProvider';
import { useLanguageManifest } from './useLanguageManifest';

export type QuestionBankState =
  | { bank: CachedBank; status: 'ready' }
  | { status: 'loading' }
  | { retry: () => void; status: 'error' }
  | { status: 'unknown' };

const PLACEHOLDER_ENTRY: BankEntry = {
  access: 'free',
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
  const query = useQuery({
    ...buildBankQuery(queryClient, access, language, difficulty, entry ?? PLACEHOLDER_ENTRY),
    enabled: needsDownload && access.contentBaseUrl !== null,
  });
  const { data, isError } = query;
  if (!entry) return { status: 'unknown' };
  if (needsDownload && data) return { bank: data, status: 'ready' };
  if (localBank) return { bank: localBank, status: 'ready' };
  if (isError) return { retry: () => void query.refetch(), status: 'error' };
  return { status: 'loading' };
}
