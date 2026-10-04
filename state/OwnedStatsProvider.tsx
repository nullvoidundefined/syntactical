// Stats belong to the signed-in user; a guest's are owned by no one. An
// account deleted on this device is handed on so its local data goes.
import type { ReactNode } from 'react';

import { useAuth } from './AuthProvider';
import { StatsProvider } from './StatsProvider';

export function OwnedStatsProvider({ children }: { children: ReactNode }) {
  const { deletedUserId, user } = useAuth();
  return (
    <StatsProvider deletedUserId={deletedUserId} ownerUserId={user?.id ?? null}>
      {children}
    </StatsProvider>
  );
}
