// The review queue for the current answer event log, built on device from
// local banks only, so it works offline. Rebuilt when the log changes and
// as the coarse clock ticks, so items come due without a new answer.
import { useMemo } from 'react';

import { buildReviewQueue } from '../services/review/buildReviewQueue';
import type { ReviewQueue } from '../services/review/types/ReviewQueue';

import { useContentContext } from './ContentProvider';
import { useQuizStats } from './StatsProvider';
import { useCoarseNow } from './useCoarseNow';

export function useReviewQueue(): ReviewQueue {
  const { eventLog } = useQuizStats();
  const { readLocalBank } = useContentContext();
  const now = useCoarseNow();
  return useMemo(() => buildReviewQueue(eventLog, readLocalBank, new Date(now)), [eventLog, now, readLocalBank]);
}
