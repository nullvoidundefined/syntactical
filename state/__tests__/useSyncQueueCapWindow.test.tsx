// PR #33 review round 2, fix 1 (B-36): the stored-event cap flag is not
// forever. useSyncQueue records when each user hit the cap; that user's passes
// upload nothing for 24 hours, then one pass POSTs exactly one batch. Any 2xx
// upload clears the flag (isUploadCapReached false) and normal uploads resume;
// signing out clears the flag for that user. Real StatsProvider, runSyncPass,
// AuthProvider, and SyncProvider; apiFetch routed to a fake server per account
// whose maxStoredEvents option sets the cap; jest fake timers move the clock.
import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer, type FakeSyncServer } from '../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../AuthProvider';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { SyncProvider, useSync } from '../SyncProvider';
import { useSyncQueue } from '../useSyncQueue';
import { flush, idsOf, readStoredLog, seedEventLog } from './syncTestSupport';

type RequestInit = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };

// The account whose session is in force, the account the next sign-in
// returns, and each account's fake server.
const mockApi = {
  activeUserId: null as string | null,
  servers: new Map<string, FakeSyncServer>(),
  signInSessionValue: null as string | null,
  signInUserId: null as string | null,
};

jest.mock('../../clients/apiClient', () => ({
  apiFetch: (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST' && path === 'auth/sessions') {
      mockApi.activeUserId = mockApi.signInUserId;
      return Promise.resolve({ status: 201, body: { data: { token: mockApi.signInSessionValue, userId: mockApi.signInUserId } } });
    }
    if (method === 'DELETE' && path === 'auth/sessions/current') {
      mockApi.activeUserId = null;
      return Promise.resolve({ status: 204, body: null });
    }
    const userId = mockApi.activeUserId;
    const server = userId === null ? undefined : mockApi.servers.get(userId);
    if (!server) return Promise.resolve({ status: 401, body: { error: { code: 'AUTH_SESSION_REQUIRED' } } });
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

type QueueValue = ReturnType<typeof useSyncQueue>;
type StatsValue = ReturnType<typeof useQuizStats>;

const latest: { queue: QueueValue | null; stats: StatsValue | null } = { queue: null, stats: null };

function Probe({ userId }: { userId: string | null }) {
  latest.queue = useSyncQueue(userId);
  latest.stats = useQuizStats();
  return null;
}

function Harness({ userId }: { userId: string | null }) {
  return (
    <StatsProvider ownerUserId={userId}>
      <Probe userId={userId} />
    </StatsProvider>
  );
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Each step ends at or before the target, so no pass sees a later clock.
const STEP = HOUR;
// A day of fake time in hourly steps, each flushed, outlasts jest's 5 s default under load.
const WINDOW_TEST_TIMEOUT_MS = 60 * 1000;

const correctAnswer = { choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true } as const;

// Moves the fake clock in steps, letting each pass the timers start finish,
// until `untilMs` (Date.now() is faked with the timers).
async function advanceTo(untilMs: number): Promise<void> {
  while (Date.now() < untilMs) {
    const step = Math.min(STEP, untilMs - Date.now());
    await act(async () => {
      jest.advanceTimersByTime(step);
    });
    await flush();
  }
}

async function syncNow(): Promise<void> {
  await act(async () => {
    await latest.queue?.syncNow();
  });
  await flush();
}

async function recordNewAnswer(): Promise<string> {
  const before = new Set(idsOf(latest.stats?.eventLog ?? []));
  await act(async () => {
    latest.stats?.recordAnswer(correctAnswer);
  });
  await flush();
  const added = (latest.stats?.eventLog ?? []).find(({ eventId }) => !before.has(eventId));
  if (!added) throw new Error('recordAnswer appended no event');
  return added.eventId;
}

// A server that already holds `remoteCount` events with the cap at that count,
// so every upload is 422 SYNC_EVENT_CAP_REACHED until the test raises
// options.maxStoredEvents (the fake reads it on every POST).
function createCappedServer(remoteCount: number) {
  const options = { maxStoredEvents: remoteCount };
  const server = createFakeSyncServer(options);
  server.seed(Array.from({ length: remoteCount }, (_unused, index) => buildAnswerEvent(7000 + index)));
  return { options, server };
}

// Mounts as a guest, waits for the stats to hydrate, then signs userId in;
// the first pass runs against the capped server.
async function mountCappedUser(userId: string) {
  const view = await render(<Harness userId={null} />);
  await flush();
  expect(latest.stats?.isHydrated).toBe(true);
  mockApi.activeUserId = userId;
  await view.rerender(<Harness userId={userId} />);
  await flush();
  expect(latest.queue?.isUploadCapReached).toBe(true);
  return view;
}

function installFakeClock(): void {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date(Date.UTC(2026, 9, 2, 12)));
}

function stubAppState(): void {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(
    () => ({ remove: () => undefined }) as ReturnType<typeof AppState.addEventListener>,
  );
}

async function resetAll(): Promise<void> {
  installFakeClock();
  await AsyncStorage.clear();
  mockApi.activeUserId = null;
  mockApi.signInUserId = null;
  mockApi.signInSessionValue = null;
  mockApi.servers = new Map();
  latest.queue = null;
  latest.stats = null;
  stubAppState();
}

describe('useSyncQueue cap window', () => {
  const userA = randomUUID();

  beforeEach(resetAll);

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('posts nothing for a capped user within 24 hours, then exactly one POST once 24 hours have passed', async () => {
    const { server } = createCappedServer(2);
    mockApi.servers.set(userA, server);
    await seedEventLog(buildOwnedLog(3, userA));
    await mountCappedUser(userA);
    const cappedAt = Date.now();
    const postsAfterCap = server.postRequests().length;
    expect(postsAfterCap).toBeGreaterThanOrEqual(1);

    await advanceTo(cappedAt + DAY - HOUR);
    await syncNow();

    expect(server.postRequests()).toHaveLength(postsAfterCap);
    expect(latest.queue?.isUploadCapReached).toBe(true);

    await advanceTo(cappedAt + DAY + MINUTE);
    await syncNow();
    await syncNow();

    expect(server.postRequests()).toHaveLength(postsAfterCap + 1);
    expect(latest.queue?.isUploadCapReached).toBe(true);
  }, WINDOW_TEST_TIMEOUT_MS);

  it('clears isUploadCapReached on a 2xx upload after the 24-hour window and resumes normal uploads', async () => {
    const { options, server } = createCappedServer(2);
    mockApi.servers.set(userA, server);
    const owned = buildOwnedLog(3, userA);
    await seedEventLog(owned);
    await mountCappedUser(userA);
    const cappedAt = Date.now();

    options.maxStoredEvents = 1000;
    await advanceTo(cappedAt + DAY + MINUTE);
    await syncNow();

    expect(latest.queue?.isUploadCapReached).toBe(false);
    for (const id of idsOf(owned)) expect(server.storedIds().has(id)).toBe(true);

    const freshId = await recordNewAnswer();
    await syncNow();

    expect(server.storedIds().has(freshId)).toBe(true);
    const stored = await readStoredLog();
    for (const id of [...idsOf(owned), freshId]) {
      expect(stored.find(({ eventId }) => eventId === id)).toMatchObject({ isSynced: true, ownerUserId: userA });
    }
    expect(latest.queue?.isUploadCapReached).toBe(false);
  }, WINDOW_TEST_TIMEOUT_MS);
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

describe('sign-out and the cap flag', () => {
  const userA = randomUUID();

  beforeEach(async () => {
    await resetAll();
    app.auth = null;
    app.sync = null;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('clears the cap flag for a user who signs out, so the next sign-in uploads within the 24-hour window', async () => {
    const { options, server } = createCappedServer(2);
    mockApi.servers.set(userA, server);
    const owned = buildOwnedLog(3, userA);
    await seedEventLog(owned);
    await render(<App />);
    await flush();
    expect(app.auth?.isHydrated).toBe(true);

    await signInThroughAuth(userA);
    expect(app.sync?.isUploadCapReached).toBe(true);
    const postsWhileCapped = server.postRequests().length;

    await act(async () => {
      await app.auth?.signOut();
    });
    await flush();
    expect(app.sync?.isUploadCapReached).toBe(false);

    options.maxStoredEvents = 1000;
    await advanceTo(Date.now() + HOUR);
    await signInThroughAuth(userA);

    expect(server.postRequests().length).toBeGreaterThan(postsWhileCapped);
    for (const id of idsOf(owned)) expect(server.storedIds().has(id)).toBe(true);
    expect(app.sync?.isUploadCapReached).toBe(false);
  }, WINDOW_TEST_TIMEOUT_MS);
});
