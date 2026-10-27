// Downloads the Medium and Hard banks the learner's due reviews come from when this device has no copy (a new
// device, a reinstall, or a bank the cache evicted), each time the event log or the coarse clock changes.
// Renders nothing.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { prefetchReviewBanks } from '../services/content/prefetchReviewBanks';
import { listDueReviewBankKeys } from '../services/review/listDueReviewBankKeys';

import { useContentContext } from './ContentProvider';
import { useQuizStats } from './StatsProvider';
import { useCoarseNow } from './useCoarseNow';
import { useLanguageManifest } from './useLanguageManifest';

export function ReviewBankPrefetch() {
  const queryClient = useQueryClient();
  const access = useContentContext();
  const manifest = useLanguageManifest();
  const { eventLog } = useQuizStats();
  const now = useCoarseNow();
  useEffect(() => {
    prefetchReviewBanks(queryClient, manifest, access, listDueReviewBankKeys(eventLog, new Date(now)));
  }, [access, eventLog, manifest, now, queryClient]);
  return null;
}
