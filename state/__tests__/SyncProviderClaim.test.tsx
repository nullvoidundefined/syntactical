// SyncProvider guest claim ordering (Task 3.11 hardening; B-36, B-61): the
// claim completes only after the claimed event log has reached storage, and
// nothing uploads before then; a claim whose write fails stays pending and is
// retried on the next mount, ending with the guest events owned by the user
// and uploaded. Real AuthProvider, StatsProvider, and runSyncPass; apiFetch
// routed to a fake server per signed-in account; AsyncStorage writes of the
// claimed event log held or failed on purpose.
import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';
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
  getLatestRequestSeq: () => 0,
  onUnauthorized: () => () => undefined,
}));

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

async function mountHydrated() {
  const view = await render(<App />);
  await waitFor(() => {
    expect(latest.auth?.isHydrated).toBe(true);
    expect(latest.stats?.isHydrated).toBe(true);
  });
  return view;
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

type SetItem = typeof AsyncStorage.setItem;

const originalSetItem: SetItem = AsyncStorage.setItem;

// An event-log write that gives at least one entry to userId: the claim.
function isClaimWrite(key: string, value: string, userId: string): boolean {
  if (key !== EVENT_LOG_STORAGE_KEY) return false;
  const log = JSON.parse(value) as unknown;
  return Array.isArray(log) && log.some((entry: { ownerUserId?: unknown }) => entry.ownerUserId === userId);
}

// Holds the first claim write for userId until release().
function holdClaimWrite(userId: string) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hold = { isReached: false };
  AsyncStorage.setItem = (async (key: string, value: string) => {
    if (!hold.isReached && isClaimWrite(key, value, userId)) {
      hold.isReached = true;
      await gate;
    }
    return originalSetItem(key, value);
  }) as SetItem;
  return { isReached: () => hold.isReached, release: () => release() };
}

// Fails every claim write for userId while isFailing is set.
function failClaimWrites(userId: string) {
  const control = { failures: 0, isFailing: true };
  AsyncStorage.setItem = (async (key: string, value: string) => {
    if (control.isFailing && isClaimWrite(key, value, userId)) {
      control.failures += 1;
      throw new Error('storage unavailable');
    }
    return originalSetItem(key, value);
  }) as SetItem;
  return control;
}

describe('SyncProvider guest claim ordering', () => {
  let router: ApiRouter;

  beforeEach(async () => {
    AsyncStorage.setItem = originalSetItem;
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    latest.auth = null;
    latest.stats = null;
  });

  afterEach(() => {
    AsyncStorage.setItem = originalSetItem;
  });

  it('completes the guest claim only after the claimed event log is stored, and uploads nothing before then', async () => {
    const userId = randomUUID();
    const guestLog = buildOwnedLog(5, null);
    await seedEventLog(guestLog);
    const hold = holdClaimWrite(userId);
    await mountHydrated();

    await signIn(router, userId);
    await waitFor(() => expect(hold.isReached()).toBe(true));
    await flush();
    expect(latest.auth?.guestClaimUserId).toBe(userId);
    expect(router.serverFor(userId).postRequests()).toEqual([]);

    hold.release();
    await waitFor(() => expect(latest.auth?.guestClaimUserId).toBeNull());
    await waitFor(() => expect(router.serverFor(userId).storedIds().size).toBe(5));
    await waitFor(async () => expect((await readStoredLog()).every(({ isSynced }) => isSynced)).toBe(true));
    const stored = await readStoredLog();
    expect(idsOf(stored).sort()).toEqual(idsOf(guestLog).sort());
    expect(stored.every(({ ownerUserId }) => ownerUserId === userId)).toBe(true);
    expect(router.syncRequestsWithoutSession()).toEqual([]);
  });

  it('keeps the claim pending when the claimed event log fails to store, and the next mount retries it, ending with the guest events owned by the user and uploaded', async () => {
    const userId = randomUUID();
    const guestLog = buildOwnedLog(5, null);
    await seedEventLog(guestLog);
    const failing = failClaimWrites(userId);
    const firstView = await mountHydrated();

    await signIn(router, userId);
    await waitFor(() => expect(failing.failures).toBeGreaterThan(0));
    await flush();
    expect(latest.auth?.guestClaimUserId).toBe(userId);
    expect(await readStoredLog()).toEqual(guestLog);

    await firstView.unmount();
    failing.isFailing = false;
    latest.auth = null;
    latest.stats = null;
    await mountHydrated();

    await waitFor(() => expect(router.serverFor(userId).storedIds().size).toBe(5));
    await waitFor(async () => {
      const stored = await readStoredLog();
      expect(stored.every(({ isSynced, ownerUserId }) => isSynced && ownerUserId === userId)).toBe(true);
    });
    expect([...router.serverFor(userId).storedIds()].sort()).toEqual(idsOf(guestLog).sort());
    expect(idsOf(await readStoredLog()).sort()).toEqual(idsOf(guestLog).sort());
    // Re-read through the declared type: the null reset above narrows `latest.auth` for tsc.
    expect((latest.auth as AuthValue | null)?.guestClaimUserId).toBeNull();
    expect(router.syncRequestsWithoutSession()).toEqual([]);
  });
});
