// SyncProvider (Task 3.11; B-36, B-61): on the first sign-in of a user on this
// device it claims the guest event log for that user, completes the claim,
// and a pass uploads the claimed events in batches of 200 until every one is
// synced; a user who has signed in here before never takes the guest log.
// Real AuthProvider, StatsProvider, and runSyncPass; apiFetch routed to a
// fake server per signed-in account.
import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AUTH_STORAGE_KEY } from '../../constants/appConfig';
import { buildOwnedLog } from '../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../AuthProvider';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { SyncProvider } from '../SyncProvider';
import { createApiRouter, flush, idsOf, readStoredLog, seedEventLog, type ApiRouter } from './syncTestSupport';

const mockApi: { router: ApiRouter | null } = { router: null };

jest.mock('../../clients/apiClient', () => ({
  apiFetch: (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    if (!mockApi.router) throw new Error('no router installed');
    return mockApi.router.request(path, init);
  },
}));
jest.mock('../../clients/getLatestRequestSeq', () => ({ getLatestRequestSeq: () => 0 }));
jest.mock('../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: (key: string) => Promise.resolve(values.get(key) ?? null),
    setItemAsync: (key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key: string) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
});

jest.mock('@react-native-community/netinfo', () => {
  const state = { isConnected: true, isInternetReachable: true, type: 'wifi' };
  const api = {
    addEventListener: (listener: (value: typeof state) => void) => {
      listener(state);
      return () => undefined;
    },
    fetch: () => Promise.resolve(state),
    useNetInfo: () => state,
  };
  return { __esModule: true, default: api, ...api };
});

type AuthValue = ReturnType<typeof useAuth>;
type StatsValue = ReturnType<typeof useQuizStats>;

const latest: { auth: AuthValue | null; stats: StatsValue | null } = { auth: null, stats: null };

function Probe() {
  latest.auth = useAuth();
  latest.stats = useQuizStats();
  return null;
}

// The provider order app/_layout.tsx uses: stats owned by the signed-in user.
function OwnedStats({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

function App() {
  return (
    <AuthProvider>
      <OwnedStats>
        <SyncProvider>
          <Probe />
        </SyncProvider>
      </OwnedStats>
    </AuthProvider>
  );
}

function buildEmail(): string {
  return [`reader-${randomBytes(4).toString('hex')}`, 'example.test'].join('@');
}

function buildCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function mountHydrated(): Promise<void> {
  await render(<App />);
  await waitFor(() => {
    expect(latest.auth?.isHydrated).toBe(true);
    expect(latest.stats?.isHydrated).toBe(true);
  });
}

async function signIn(router: ApiRouter, userId: string): Promise<void> {
  router.state.signInUserId = userId;
  router.state.signInSessionValue = randomBytes(24).toString('hex');
  let result: unknown;
  await act(async () => {
    result = await latest.auth?.verifyCode(buildEmail(), buildCode());
  });
  expect(result).toEqual({ isOk: true });
}

function postedBatchSizes(router: ApiRouter, userId: string): number[] {
  return router
    .serverFor(userId)
    .postRequests()
    .map(({ body }) => (body as { events: unknown[] }).events.length);
}

describe('SyncProvider guest claim', () => {
  let router: ApiRouter;

  beforeEach(async () => {
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    latest.auth = null;
    latest.stats = null;
  });

  it('on first sign-in claims a 1,000-event guest log, completes the claim, and uploads it in 5 batches of 200, all ending synced', async () => {
    const userId = randomUUID();
    const guestLog = buildOwnedLog(1000, null);
    await seedEventLog(guestLog);
    await mountHydrated();
    expect(latest.stats?.eventLog).toHaveLength(1000);

    await signIn(router, userId);
    await waitFor(() => expect(router.serverFor(userId).storedIds().size).toBe(1000), { timeout: 15_000 });
    await waitFor(async () => expect((await readStoredLog()).every(({ isSynced }) => isSynced)).toBe(true), { timeout: 15_000 });

    expect(postedBatchSizes(router, userId)).toEqual([200, 200, 200, 200, 200]);
    expect([...router.serverFor(userId).storedIds()].sort()).toEqual(idsOf(guestLog).sort());
    const stored = await readStoredLog();
    expect(stored).toHaveLength(1000);
    expect(stored.every(({ ownerUserId }) => ownerUserId === userId)).toBe(true);
    expect(latest.auth?.guestClaimUserId).toBeNull();
    expect(latest.stats?.eventLog).toHaveLength(1000);
    expect(router.syncRequestsWithoutSession()).toEqual([]);
  }, 30_000);

  it('does not claim or upload the guest log for a user who has signed in on this device before', async () => {
    const userId = randomUUID();
    const guestLog = buildOwnedLog(5, null);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId: null }));
    await seedEventLog(guestLog);
    await mountHydrated();

    await signIn(router, userId);
    await waitFor(() => expect(router.serverFor(userId).getRequests().length).toBeGreaterThan(0));
    await flush();

    expect(latest.auth?.guestClaimUserId).toBeNull();
    expect(router.serverFor(userId).postRequests()).toEqual([]);
    expect(await readStoredLog()).toEqual(guestLog);
    expect(latest.stats?.eventLog).toEqual([]);
  });
});
