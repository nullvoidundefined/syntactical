// Runs sync passes for the signed-in user: on sign-in, when the app returns
// to the foreground, every 5 minutes while online, and on demand. One pass at
// a time per user; a failed pass retries after 30 s, doubling up to 15
// minutes, and a success resets the delay. A pass stops once its user is no
// longer the current one, and every write it makes names that user.
import { useCallback, useEffect, useRef, useState } from 'react';

import { isRecord } from '@syntactical/content-schema';
import { AppState } from 'react-native';

import { apiFetch } from '../clients/apiClient';
import { readJson } from '../clients/readJson';
import { writeJson } from '../clients/writeJson';
import {
  SYNC_BACKOFF_CAP_MS,
  SYNC_BACKOFF_FACTOR,
  SYNC_BACKOFF_START_MS,
  SYNC_CAP_REACHED_STORAGE_KEY,
  SYNC_CAP_RETRY_MS,
  SYNC_INTERVAL_MS,
} from '../constants/appConfig';
import { runSyncPass } from '../services/sync/runSyncPass';

import { useQuizStats } from './StatsProvider';
import { useIsOnline } from './useIsOnline';

type RunningPass = { generation: number; promise: Promise<boolean>; userId: string };

type SyncQueue = { cancelPass: () => void; isSyncing: boolean; isUploadCapReached: boolean; syncNow: () => Promise<boolean> };

// The users the server stopped at the stored-event cap, with when (ms). The
// first stored form was an array of ids; those read as capped at 0.
async function readCappedUsers(): Promise<Map<string, number>> {
  const stored = await readJson<unknown>(SYNC_CAP_REACHED_STORAGE_KEY, {});
  const capped = new Map<string, number>();
  if (Array.isArray(stored)) {
    for (const id of stored) if (typeof id === 'string') capped.set(id, 0);
  } else if (isRecord(stored)) {
    for (const [id, cappedAt] of Object.entries(stored)) if (typeof cappedAt === 'number') capped.set(id, cappedAt);
  }
  return capped;
}

export function useSyncQueue(userId: string | null): SyncQueue {
  const stats = useQuizStats();
  const isOnline = useIsOnline();
  const [isSyncing, setIsSyncing] = useState(false);
  const [cappedUserIds, setCappedUserIds] = useState<string[]>([]);
  const capLoad = useRef<Promise<Map<string, number>> | null>(null);

  const latest = useRef({ stats, userId });
  latest.current = { stats, userId };
  const generation = useRef(0);
  const running = useRef<RunningPass | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(SYNC_BACKOFF_START_MS);
  const isMounted = useRef(true);

  // Reads the stored cap list once; later passes and the exposed flag share it.
  const loadCapped = useCallback((): Promise<Map<string, number>> => {
    capLoad.current ??= readCappedUsers();
    return capLoad.current;
  }, []);

  const rememberCapped = useCallback(
    async (user: string): Promise<void> => {
      const capped = await loadCapped();
      capped.set(user, Date.now());
      if (isMounted.current) setCappedUserIds([...capped.keys()]);
      await writeJson(SYNC_CAP_REACHED_STORAGE_KEY, Object.fromEntries(capped));
    },
    [loadCapped],
  );

  const forgetCapped = useCallback(
    async (user: string): Promise<void> => {
      const capped = await loadCapped();
      if (!capped.delete(user)) return;
      if (isMounted.current) setCappedUserIds([...capped.keys()]);
      await writeJson(SYNC_CAP_REACHED_STORAGE_KEY, Object.fromEntries(capped));
    },
    [loadCapped],
  );

  const clearRetry = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  const runPass = useCallback((): Promise<boolean> => {
    const { stats: current, userId: user } = latest.current;
    if (!isMounted.current || user === null || !current.isHydrated) return Promise.resolve(false);
    const passGeneration = generation.current;
    const existing = running.current;
    if (existing) {
      const { generation: existingGeneration, promise, userId: existingUserId } = existing;
      if (existingUserId === user && existingGeneration === passGeneration) return promise;
    }

    const isCurrent = () => generation.current === passGeneration && latest.current.userId === user;
    const pass: RunningPass = { generation: passGeneration, promise: Promise.resolve(false), userId: user };
    const executePass = async (): Promise<boolean> => {
      setIsSyncing(true);
      // A capped user posts nothing inside the retry window, then one probe batch; both still download.
      const cappedAt = (await loadCapped()).get(user);
      const isCapProbe = cappedAt !== undefined && Date.now() - cappedAt >= SYNC_CAP_RETRY_MS;
      let isProbeStored = false;
      const result = await runSyncPass({
        eventLog: cappedAt !== undefined && !isCapProbe ? [] : current.eventLog,
        isCapProbe,
        isCurrent,
        markHeld: (ids, reason) => latest.current.stats.markEventsHeld(ids, user, reason),
        markReleased: (ids) => latest.current.stats.markEventsReleased(ids, user),
        markSynced: (ids) => {
          isProbeStored = true;
          return latest.current.stats.markEventsSynced(ids, user);
        },
        mergeDownloaded: (events, cursor) => latest.current.stats.mergeDownloadedEvents(events, cursor, user),
        request: apiFetch,
        syncCursor: current.readSyncCursor(user),
        userId: user,
      });
      const { isOk, isUploadCapReached } = result;
      // A pass that is no longer current (sign-out, user switch) must not touch cap state.
      if (isCurrent()) {
        if (isUploadCapReached) await rememberCapped(user);
        else if (isCapProbe && isProbeStored) await forgetCapped(user);
      }
      if (running.current === pass) {
        running.current = null;
        if (isMounted.current) setIsSyncing(false);
      }
      if (isCurrent()) {
        clearRetry();
        if (isOk) {
          retryDelay.current = SYNC_BACKOFF_START_MS;
        } else {
          const delay = retryDelay.current;
          retryDelay.current = Math.min(delay * SYNC_BACKOFF_FACTOR, SYNC_BACKOFF_CAP_MS);
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            void runPass();
          }, delay);
        }
      }
      return isOk;
    };
    pass.promise = executePass();
    running.current = pass;
    return pass.promise;
  }, [clearRetry, forgetCapped, loadCapped, rememberCapped]);

  // Sync now: a pass already in flight began before the caller's latest
  // writes, so one follow-up pass runs after it and its result is returned.
  const syncNow = useCallback(async (): Promise<boolean> => {
    const earlier = running.current;
    if (earlier) await earlier.promise;
    return runPass();
  }, [runPass]);

  // Stops the pass in flight and any pending retry; a later pass starts fresh.
  const cancelPass = useCallback(() => {
    generation.current += 1;
    clearRetry();
  }, [clearRetry]);

  // A new user (or none) starts fresh: pending passes stop, backoff resets.
  useEffect(() => {
    return () => {
      generation.current += 1;
      clearRetry();
      retryDelay.current = SYNC_BACKOFF_START_MS;
    };
  }, [clearRetry, userId]);

  // Signing out (the user goes to none) clears that user's cap flag.
  const previousUserId = useRef<string | null>(userId);
  useEffect(() => {
    const previous = previousUserId.current;
    previousUserId.current = userId;
    if (previous !== null && userId === null) void forgetCapped(previous);
  }, [forgetCapped, userId]);

  useEffect(() => {
    isMounted.current = true;
    void loadCapped().then((capped) => {
      if (isMounted.current) setCappedUserIds([...capped.keys()]);
    });
    return () => {
      isMounted.current = false;
    };
  }, [loadCapped]);

  const isReady = userId !== null && stats.isHydrated;

  useEffect(() => {
    if (isReady) void runPass();
  }, [isReady, runPass, userId]);

  useEffect(() => {
    if (!isReady) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isMounted.current) void runPass();
    });
    return () => subscription.remove();
  }, [isReady, runPass]);

  useEffect(() => {
    if (!isReady || !isOnline) return undefined;
    // While a retry is pending the backoff, not the interval, decides.
    const timer = setInterval(() => {
      if (retryTimer.current === null) void runPass();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOnline, isReady, runPass]);

  return { cancelPass, isSyncing, isUploadCapReached: userId !== null && cappedUserIds.includes(userId), syncNow };
}
