// True while any question bank is transferring. The manifest is fetched
// on every launch and is small, so it does not count.
import { useIsFetching } from '@tanstack/react-query';

const BANK_QUERY_KEY = ['bank'];

export function useContentDownloads(): boolean {
  return useIsFetching({ queryKey: BANK_QUERY_KEY }) > 0;
}
