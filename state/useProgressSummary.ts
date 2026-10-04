// The header's day streak, XP today, and daily goal. A guest's are computed
// on the device from the guest event log and goal history. A signed-in
// user's are the last /v1/me profile plus XP from events that profile has not
// counted; until a profile loads (offline, or the request failed) they are
// computed on the device from that user's event log and goal history.
import { useMemo } from 'react';

import { combineProfileSummary } from '../services/progress/combineProfileSummary';
import { computeLocalProgressSummary } from '../services/progress/computeLocalProgressSummary';
import { computeUnseenXpToday } from '../services/progress/computeUnseenXpToday';
import { readDeviceTimezone } from '../services/progress/readDeviceTimezone';
import { readLocalToday } from '../services/progress/readLocalToday';
import type { ProgressSummary } from '../services/progress/types/ProgressSummary';

import { useQuizStats } from './StatsProvider';
import { useCoarseNow } from './useCoarseNow';
import { useProfile } from './useProfile';

export function useProgressSummary(): ProgressSummary {
  const { eventLog, stats } = useQuizStats();
  const { snapshot } = useProfile();
  const now = useCoarseNow();
  const { goalHistory } = stats;
  // Recomputed when the local day turns over, not on every clock tick.
  const today = readLocalToday(new Date(now));
  return useMemo(() => {
    const timezone = readDeviceTimezone();
    if (snapshot === null) return computeLocalProgressSummary({ events: eventLog, goalHistory, timezone, today });
    const { profile, seenEventIds } = snapshot;
    return combineProfileSummary(profile, computeUnseenXpToday({ eventLog, seenEventIds, timezone, today }));
  }, [eventLog, goalHistory, snapshot, today]);
}
