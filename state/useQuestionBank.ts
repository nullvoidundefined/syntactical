// One bank's load state. A local copy (cached or bundled) whose hash
// matches the manifest is used directly; otherwise the bank downloads,
// keyed by its hash so overlapping requests share one fetch.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildBankQuery, findBankEntry } from '../services/content/bankQueries';
import type { CachedBank } from '../services/content/contentCache';
import { useContentContext } from './ContentProvider';
import { useLanguageManifest } from './useLanguageManifest';

export type QuestionBankState =
  | { status: 'ready'; bank: CachedBank }
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'unknown' };

const PLACEHOLDER_ENTRY = { path: '', hash: 'none' };

export function useQuestionBank(language: string, difficulty: string): QuestionBankState {
  const queryClient = useQueryClient();
  const access = useContentContext();
  const manifest = useLanguageManifest();
  const entry = findBankEntry(manifest, language, difficulty);
  const localBank = access.readLocalBank(language, difficulty);
  const needsDownload = entry !== undefined && localBank?.hash !== entry.hash;
  const query = useQuery({
    ...buildBankQuery(queryClient, access, language, difficulty, entry ?? PLACEHOLDER_ENTRY),
    enabled: needsDownload,
  });
  if (!entry) return { status: 'unknown' };
  if (needsDownload && query.data) return { status: 'ready', bank: query.data };
  if (localBank) return { status: 'ready', bank: localBank };
  if (query.isError) return { status: 'error', retry: () => void query.refetch() };
  return { status: 'loading' };
}
