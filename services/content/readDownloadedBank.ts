// The newest copy of one bank downloaded this session, read from the TanStack Query cache (key
// ['bank', language, difficulty, hash]); null when none has downloaded yet.
import type { CachedBank } from '@syntactical/content-schema';
import type { QueryClient } from '@tanstack/react-query';

export function readDownloadedBank(queryClient: QueryClient, language: string, difficulty: string): CachedBank | null {
  const [newest] = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['bank', language, difficulty] })
    .filter(({ state }) => state.data !== undefined)
    .sort((left, right) => right.state.dataUpdatedAt - left.state.dataUpdatedAt);
  return (newest?.state.data as CachedBank | undefined) ?? null;
}
