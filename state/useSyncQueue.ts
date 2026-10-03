// Runs sync passes for the signed-in user: on sign-in, when the app returns
// to the foreground, every 5 minutes while online, and on demand. One pass at
// a time per user; a failed pass retries after 30 s, doubling up to 15
// minutes, and a success resets the delay. A pass stops once its user is no
// longer the current one, and every write it makes names that user.
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppState } from 'react-native';

import { apiFetch } from '../clients/apiClient';
import { readJson } from '../clients/readJson';
import { writeJson } from '../clients/writeJson';
import {
  SYNC_BACKOFF_CAP_MS,
  SYNC_BACKOFF_FACTOR,
  SYNC_BACKOFF_START_MS,
  SYNC_CAP_REACHED_STORAGE_KEY,
  SYNC_INTERVAL_MS,
} from '../constants/appConfig';
import { runSyncPass } from '../services/sync/runSyncPass';

import { useQuizStats } from './StatsProvider';
import { useIsOnline } from './useIsOnline';

type RunningPass = { generation: number; promise: Promise<boolean>; userId: string };

type SyncQueue = { cancelPass: () => void; isSyncing: boolean; isUploadCapReached: boolean; syncNow: () => Promise<boolean> };

// The user ids the server stopped at the stored-event cap, as stored.
async function readCappedUserIds(): Promise<Set<string>> {
  const stored = await readJson<unknown>(SYNC_CAP_REACHED_STORAGE_KEY, []);
  return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []);
}

export function useSyncQueue(userId: string | null): SyncQueue {
  const stats = useQuizStats();
  const isOnline = useIsOnline();
  const [isSyncing, setIsSyncing] = useState(false);
  const [cappedUserIds, setCappedUserIds] = useState<string[]>([]);
  const capLoad = useRef<Promise<Set<string>> | null>(null);

  const latest = useRef({ stats, userId });
  latest.current = { stats, userId };
  const generation = useRef(0);
  const running = useRef<RunningPass | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(SYNC_BACKOFF_START_MS);
  const isMounted = useRef(true);

  // Reads the stored cap list once; later passes and the exposed flag share it.
  const loadCapped = useCallback((): Promise<Set<string>> => {
    capLoad.current ??= readCappedUserIds();
    return capLoad.current;
  }, []);

  const rememberCapped = useCallback(
    async (user: string): Promise<void> => {
      const capped = await loadCapped();
      if (capped.has(user)) return;
      capped.add(user);
      if (isMounted.current) setCappedUserIds([...capped]);
      await writeJson(SYNC_CAP_REACHED_STORAGE_KEY, [...capped]);
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
      // A capped user posts nothing, but still downloads.
      const isCapped = (await loadCapped()).has(user);
      const result = await runSyncPass({
        eventLog: isCapped ? [] : current.eventLog,
        isCurrent,
        markHeld: (ids, reason) => latest.current.stats.markEventsHeld(ids, user, reason),
        markSynced: (ids) => latest.current.stats.markEventsSynced(ids, user),
        mergeDownloaded: (events, cursor) => latest.current.stats.mergeDownloadedEvents(events, cursor, user),
        request: apiFetch,
        syncCursor: current.readSyncCursor(user),
        userId: user,
      });
      const { isOk, isUploadCapReached } = result;
      if (isUploadCapReached) await rememberCapped(user);
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
  }, [clearRetry, loadCapped, rememberCapped]);

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

  useEffect(() => {
    isMounted.current = true;
    void loadCapped().then((capped) => {
      if (isMounted.current) setCappedUserIds([...capped]);
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
