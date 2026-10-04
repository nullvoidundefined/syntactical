// PR #33 security round 3, fix 2 (Task 3.11, B-36, B-61): a sync pass still
// in flight when its user signs out must not record that user as capped after
// the sign-out cleared the flag. User A's last 1-event batch is refused with
// 422 SYNC_EVENT_CAP_REACHED, the download GET that follows is held, A signs
// out through AuthProvider, then the GET is released and the pass resolves.
// A's entry in the stored cap map stays cleared, and A signing back in within
// 24 hours uploads normally. Real AuthProvider, StatsProvider, SyncProvider,
// useSyncQueue, and runSyncPass; apiFetch routed to a fake server per account
// whose maxStoredEvents option sets the cap.
import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { SYNC_CAP_REACHED_STORAGE_KEY } from '../../constants/appConfig';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer, type FakeSyncServer } from '../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../AuthProvider';
import { StatsProvider } from '../StatsProvider';
import { SyncProvider, useSync } from '../SyncProvider';
import { flush, idsOf, seedEventLog } from './syncTestSupport';

type RequestInit = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };

// The account whose session is in force, the account the next sign-in
// returns, each account's fake server, and an optional gate on the next
// answer-events GET (the account is fixed when the request is sent).
const mockApi = {
  activeUserId: null as string | null,
  getHold: null as { gate: Promise<void>; isReached: boolean } | null,
  servers: new Map<string, FakeSyncServer>(),
  signInSessionValue: null as string | null,
  signInUserId: null as string | null,
};

jest.mock('../../clients/apiClient', () => ({
  apiFetch: async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST' && path === 'auth/sessions') {
      mockApi.activeUserId = mockApi.signInUserId;
      return { status: 201, body: { data: { token: mockApi.signInSessionValue, userId: mockApi.signInUserId } } };
    }
    if (method === 'DELETE' && path === 'auth/sessions/current') {
      mockApi.activeUserId = null;
      return { status: 204, body: null };
    }
    const userId = mockApi.activeUserId;
    const server = userId === null ? undefined : mockApi.servers.get(userId);
    if (!server) return { status: 401, body: { error: { code: 'AUTH_SESSION_REQUIRED' } } };
    const hold = mockApi.getHold;
    if (method === 'GET' && path.startsWith('answer-events') && hold !== null && !hold.isReached) {
      hold.isReached = true;
      await hold.gate;
    }
    return server.request(path, init);
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
type SyncValue = ReturnType<typeof useSync>;

const app: { auth: AuthValue | null; sync: SyncValue | null } = { auth: null, sync: null };

function AppProbe() {
  app.auth = useAuth();
  app.sync = useSync();
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
          <AppProbe />
        </SyncProvider>
      </OwnedStats>
    </AuthProvider>
  );
}

const HOUR = 60 * 60 * 1000;
const TEST_TIMEOUT_MS = 60 * 1000;

function buildEmail(): string {
  return [`reader-${randomBytes(4).toString('hex')}`, 'example.test'].join('@');
}

function buildCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function signInThroughAuth(userId: string): Promise<void> {
  mockApi.signInUserId = userId;
  mockApi.signInSessionValue = randomBytes(24).toString('hex');
  let result: unknown;
  await act(async () => {
    result = await app.auth?.verifyCode(buildEmail(), buildCode());
  });
  expect(result).toEqual({ isOk: true });
  await flush();
}

// Holds the next answer-events GET until the returned release is called.
function holdNextGet(): { isReached: () => boolean; release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hold = { gate, isReached: false };
  mockApi.getHold = hold;
  return { isReached: () => hold.isReached, release: () => release() };
}

// A server that already holds `remoteCount` events with the cap at that
// count, so every upload is 422 SYNC_EVENT_CAP_REACHED until the test raises
// options.maxStoredEvents (the fake reads it on every POST).
function createCappedServer(remoteCount: number) {
  const options = { maxStoredEvents: remoteCount };
  const server = createFakeSyncServer(options);
  server.seed(Array.from({ length: remoteCount }, (_unused, index) => buildAnswerEvent(7000 + index)));
  return { options, server };
}

// The stored cap map as written by useSyncQueue: user id to capped-at ms.
async function readStoredCapMap(): Promise<Record<string, unknown>> {
  const raw = await AsyncStorage.getItem(SYNC_CAP_REACHED_STORAGE_KEY);
  const parsed: unknown = raw === null ? {} : JSON.parse(raw);
  if (Array.isArray(parsed)) return Object.fromEntries(parsed.map((id) => [String(id), 0]));
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

describe('useSyncQueue cap flag when a pass outlives a sign-out', () => {
  const userA = randomUUID();

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date(Date.UTC(2026, 9, 2, 12)));
    await AsyncStorage.clear();
    mockApi.activeUserId = null;
    mockApi.getHold = null;
    mockApi.servers = new Map();
    mockApi.signInSessionValue = null;
    mockApi.signInUserId = null;
    app.auth = null;
    app.sync = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      () => ({ remove: () => undefined }) as ReturnType<typeof AppState.addEventListener>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps the cap entry cleared when the capped pass resolves after sign-out, and a re-sign-in within 24 hours uploads', async () => {
    const { options, server } = createCappedServer(2);
    mockApi.servers.set(userA, server);
    const owned = buildOwnedLog(1, userA);
    await seedEventLog(owned);
    await render(<App />);
    await flush();
    expect(app.auth?.isHydrated).toBe(true);

    const getHold = holdNextGet();
    await signInThroughAuth(userA);
    // The 1-event batch was refused at the cap and the download GET is in flight.
    expect(getHold.isReached()).toBe(true);
    expect(server.postRequests().length).toBeGreaterThanOrEqual(1);
    expect(server.storedIds().has(owned[0].eventId)).toBe(false);
    const postsWhileCapped = server.postRequests().length;

    await act(async () => {
      await app.auth?.signOut();
    });
    await flush();
    expect(app.auth?.user).toBeNull();

    await act(async () => {
      getHold.release();
    });
    await flush();

    expect(Object.keys(await readStoredCapMap())).not.toContain(userA);
    expect(app.sync?.isUploadCapReached).toBe(false);

    options.maxStoredEvents = 1000;
    await act(async () => {
      jest.advanceTimersByTime(HOUR);
    });
    await flush();
    await signInThroughAuth(userA);

    expect(server.postRequests().length).toBeGreaterThan(postsWhileCapped);
    for (const id of idsOf(owned)) expect(server.storedIds().has(id)).toBe(true);
    expect(app.sync?.isUploadCapReached).toBe(false);
    expect(Object.keys(await readStoredCapMap())).not.toContain(userA);
  }, TEST_TIMEOUT_MS);
});
