// The review queue for the current answer event log, built on device from
// local banks only, so it works offline. Rebuilt when the log changes.
import { useMemo } from 'react';

import { buildReviewQueue } from '../services/review/buildReviewQueue';
import type { ReviewQueue } from '../services/review/types/ReviewQueue';

import { useContentContext } from './ContentProvider';
import { useQuizStats } from './StatsProvider';

export function useReviewQueue(): ReviewQueue {
  const { eventLog } = useQuizStats();
  const { readLocalBank } = useContentContext();
  return useMemo(() => buildReviewQueue(eventLog, readLocalBank, new Date()), [eventLog, readLocalBank]);
}
