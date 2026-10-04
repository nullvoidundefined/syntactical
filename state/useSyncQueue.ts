// Runs sync passes for the signed-in user: on sign-in, when the app returns
// to the foreground, every 5 minutes while online, and on demand. One pass at
// a time per user; a failed pass retries after 30 s, doubling up to 15
// minutes, and a success resets the delay. A pass stops once its user is no
// longer the current one. Once the server refuses an upload at the
// stored-event cap, the user's passes upload nothing more until the user
// changes (they still download), and isUploadCapReached is true.
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppState } from 'react-native';

import { apiFetch } from '../clients/apiClient';
import { SYNC_BACKOFF_CAP_MS, SYNC_BACKOFF_FACTOR, SYNC_BACKOFF_START_MS, SYNC_INTERVAL_MS } from '../constants/appConfig';
import { runSyncPass } from '../services/sync/runSyncPass';

import { useQuizStats } from './StatsProvider';
import { useIsOnline } from './useIsOnline';

type RunningPass = { generation: number; promise: Promise<boolean>; userId: string };

type SyncQueue = { cancelPass: () => void; isSyncing: boolean; isUploadCapReached: boolean; syncNow: () => Promise<boolean> };

export function useSyncQueue(userId: string | null): SyncQueue {
  const stats = useQuizStats();
  const isOnline = useIsOnline();
  const [isSyncing, setIsSyncing] = useState(false);
  const [cappedUserId, setCappedUserId] = useState<string | null>(null);
  const cappedRef = useRef<string | null>(null);

  const latest = useRef({ stats, userId });
  latest.current = { stats, userId };
  const generation = useRef(0);
  const running = useRef<RunningPass | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(SYNC_BACKOFF_START_MS);
  const isMounted = useRef(true);

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
      const { isOk, isUploadCapReached } = await runSyncPass({
        // A capped user still downloads but uploads nothing.
        eventLog: cappedRef.current === user ? [] : current.eventLog,
        isCurrent,
        markHeld: (ids) => latest.current.stats.markEventsHeld(ids),
        markSynced: (ids) => latest.current.stats.markEventsSynced(ids),
        mergeDownloaded: (events, cursor) => latest.current.stats.mergeDownloadedEvents(events, cursor, user),
        request: apiFetch,
        syncCursor: current.readSyncCursor(user),
        userId: user,
      });
      if (isUploadCapReached && isCurrent()) {
        cappedRef.current = user;
        if (isMounted.current) setCappedUserId(user);
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
  }, [clearRetry]);

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

  // A new user (or none) starts fresh: pending passes stop, backoff and the cap flag reset.
  useEffect(() => {
    return () => {
      generation.current += 1;
      clearRetry();
      retryDelay.current = SYNC_BACKOFF_START_MS;
      cappedRef.current = null;
      setCappedUserId(null);
    };
  }, [clearRetry, userId]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

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

  return { cancelPass, isSyncing, isUploadCapReached: userId !== null && cappedUserId === userId, syncNow };
}
