// TanStack Query client for content. Content changes only when the
// manifest hash changes, so nothing goes stale on a timer, nothing is
// garbage-collected mid-session, and failures surface for Retry.
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity,
      },
    },
  });
}
