// The signed-in user's /v1/me profile, fetched again each time more events
// sync and when the device's local date turns over (the profile's XP and day
// streak are for the day it was fetched), with the ids of the events that were synced when it was requested
// (the ones it counts). The previous profile stays shown while the next
// loads. updateDailyGoal shows the new goal at once, sends PATCH /v1/me, and
// restores the previous profile when the server refuses or cannot be reached.
import { useCallback, useRef } from 'react';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../clients/apiClient';
import { HTTP_STATUS_OK } from '../constants/appConfig';
import { parseProfile } from '../services/progress/parseProfile';
import { readLocalToday } from '../services/progress/readLocalToday';
import type { Profile } from '../services/progress/types/Profile';

import { useAuth } from './AuthProvider';
import { useQuizStats } from './StatsProvider';
import { useCoarseNow } from './useCoarseNow';

export type ProfileSnapshot = { profile: Profile; seenEventIds: ReadonlySet<string>; userId: string };

type ProfileState = {
  snapshot: ProfileSnapshot | null;
  updateDailyGoal: (goal: number) => Promise<boolean>;
};

const PROFILE_QUERY_ROOT = 'me';

async function fetchProfile(userId: string, seenEventIds: ReadonlySet<string>): Promise<ProfileSnapshot> {
  const { body, status } = await apiFetch('me');
  const profile = status === HTTP_STATUS_OK ? parseProfile(body) : null;
  if (profile === null) throw new Error(`profile request answered ${status}`);
  return { profile, seenEventIds, userId };
}

export function useProfile(): ProfileState {
  const { user } = useAuth();
  const { eventLog } = useQuizStats();
  const queryClient = useQueryClient();
  const today = readLocalToday(new Date(useCoarseNow()));
  const todayRef = useRef(today);
  todayRef.current = today;
  const userId = user?.id ?? null;
  const syncedIds = eventLog.filter(({ isSynced }) => isSynced).map(({ eventId }) => eventId);
  const syncedIdsRef = useRef(syncedIds);
  syncedIdsRef.current = syncedIds;
  const queryKey = [PROFILE_QUERY_ROOT, userId, today, syncedIds.length];

  const { data } = useQuery({
    enabled: userId !== null,
    placeholderData: keepPreviousData,
    queryFn: () => fetchProfile(userId ?? '', new Set(syncedIdsRef.current)),
    queryKey,
    // A refused or offline request falls back to the device's own count.
    retry: false,
  });

  const updateDailyGoal = useCallback(
    async (goal: number): Promise<boolean> => {
      if (userId === null) return false;
      const readCurrentKey = () => [PROFILE_QUERY_ROOT, userId, todayRef.current, syncedIdsRef.current.length];
      const key = readCurrentKey();
      const previous = queryClient.getQueryData<ProfileSnapshot>(key);
      if (previous !== undefined) {
        queryClient.setQueryData<ProfileSnapshot>(key, { ...previous, profile: { ...previous.profile, dailyGoal: goal } });
      }
      try {
        const { body, status } = await apiFetch('me', { body: { dailyGoal: goal }, method: 'PATCH' });
        const profile = status === HTTP_STATUS_OK ? parseProfile(body) : null;
        if (profile === null) throw new Error(`profile update answered ${status}`);
        // A sync or a new day while the request was out moves the query to
        // another key; the accepted profile goes to the key current now.
        queryClient.setQueryData<ProfileSnapshot>(readCurrentKey(), { profile, seenEventIds: new Set(syncedIdsRef.current), userId });
        return true;
      } catch {
        if (previous !== undefined) queryClient.setQueryData(key, previous);
        return false;
      }
    },
    [queryClient, userId],
  );

  // A placeholder kept from another user's query is never shown.
  return { snapshot: data !== undefined && data.userId === userId ? data : null, updateDailyGoal };
}
