// Mounts the sync queue for the signed-in user and, on a user's first sign-in
// on this device, hands the guest event log to that user before the first
// pass. Exposes sync-now and the syncing flag through useSync().
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from './AuthProvider';
import { useQuizStats } from './StatsProvider';
import { useSyncQueue } from './useSyncQueue';

type SyncContextValue = {
  cancelPass: () => void;
  isSyncing: boolean;
  isUploadCapReached: boolean;
  syncNow: () => Promise<boolean>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { completeGuestClaim, guestClaimUserId, user } = useAuth();
  const { claimGuestEvents, isHydrated } = useQuizStats();

  // The queue waits (no user) until the claim is done, so the first pass
  // already sees the claimed events. A failed claim stays pending for the
  // next launch, and the queue runs for the user's own events meanwhile.
  const [failedClaimUserId, setFailedClaimUserId] = useState<string | null>(null);
  const isClaimWaiting = guestClaimUserId !== null && guestClaimUserId !== failedClaimUserId;
  const { cancelPass, isSyncing, isUploadCapReached, syncNow } = useSyncQueue(isClaimWaiting ? null : (user?.id ?? null));

  useEffect(() => {
    if (guestClaimUserId === null || !isHydrated) return;
    const userId = guestClaimUserId;
    void claimGuestEvents(userId).then(
      () => completeGuestClaim(userId),
      () => setFailedClaimUserId(userId),
    );
  }, [claimGuestEvents, completeGuestClaim, guestClaimUserId, isHydrated]);

  const value = useMemo<SyncContextValue>(
    () => ({ cancelPass, isSyncing, isUploadCapReached, syncNow }),
    [cancelPass, isSyncing, isUploadCapReached, syncNow],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (value === null) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
