// PR #33 review fix 4 (B-36): useSync() exposes the queue's isUploadCapReached
// so the UI can say uploads have stopped at the stored-event cap.
import { render } from '@testing-library/react-native';

import { SyncProvider, useSync } from '../SyncProvider';

type QueueValue = {
  cancelPass: () => void;
  isSyncing: boolean;
  isUploadCapReached: boolean;
  syncNow: () => Promise<boolean>;
};

const mockQueue: { value: QueueValue } = {
  value: { cancelPass: () => undefined, isSyncing: false, isUploadCapReached: false, syncNow: () => Promise.resolve(true) },
};

jest.mock('../useSyncQueue', () => ({ useSyncQueue: () => mockQueue.value }));
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({ completeGuestClaim: () => undefined, guestClaimUserId: null, user: { id: 'user-1' } }),
}));
jest.mock('../StatsProvider', () => ({
  useQuizStats: () => ({ claimGuestEvents: () => Promise.resolve(), isHydrated: true }),
}));

const latest: { sync: ReturnType<typeof useSync> | null } = { sync: null };

function Probe() {
  latest.sync = useSync();
  return null;
}

function App() {
  return (
    <SyncProvider>
      <Probe />
    </SyncProvider>
  );
}

describe('useSync isUploadCapReached', () => {
  it('passes the queue\'s isUploadCapReached through, true and then false', async () => {
    mockQueue.value = { ...mockQueue.value, isUploadCapReached: true };
    const view = await render(<App />);
    expect(latest.sync?.isUploadCapReached).toBe(true);

    mockQueue.value = { ...mockQueue.value, isUploadCapReached: false };
    await view.rerender(<App />);
    expect(latest.sync?.isUploadCapReached).toBe(false);
  });
});
