// Downloads the Medium and Hard banks the learner's due reviews come from when this device has no copy (a new
// device, a reinstall, or a bank the cache evicted), each time the event log or the coarse clock changes. Waits
// for the manifest refresh to settle, as useQuestionBank does, so a changed bank is not downloaded under its old
// hash first. Renders nothing.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { buildManifestQuery } from '../services/content/buildManifestQuery';
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
  const { status: manifestStatus } = useQuery(buildManifestQuery(access.contentBaseUrl, false));
  const isManifestPending = access.contentBaseUrl !== null && manifestStatus === 'pending';
  useEffect(() => {
    if (isManifestPending) return;
    prefetchReviewBanks(queryClient, manifest, access, listDueReviewBankKeys(eventLog, new Date(now)), now);
  }, [access, eventLog, isManifestPending, manifest, now, queryClient]);
  return null;
}
