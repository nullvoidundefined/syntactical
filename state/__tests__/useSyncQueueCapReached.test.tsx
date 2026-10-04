// Once the server answers an upload with 422 SYNC_EVENT_CAP_REACHED,
// useSyncQueue stops uploading for that user until the user changes (no POST
// on later passes), still downloads, and exposes isUploadCapReached for the
// UI; another user on the same device is not blocked. A held event reaches
// the stored event log. Real StatsProvider and runSyncPass, apiFetch routed to
// a fake server per account.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer, type FakeSyncServer } from '../../services/sync/__tests__/fakeSyncServer';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { useSyncQueue } from '../useSyncQueue';
import { flush, idsOf, readStoredLog, seedEventLog } from './syncTestSupport';

type RequestInit = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };

// The account whose session is in force and each account's fake server.
const mockApi = { activeUserId: null as string | null, servers: new Map<string, FakeSyncServer>() };

jest.mock('../../clients/apiClient', () => ({
  apiFetch: (path: string, init?: RequestInit) => {
    const userId = mockApi.activeUserId;
    const server = userId === null ? undefined : mockApi.servers.get(userId);
    if (!server) return Promise.resolve({ status: 401, body: { error: { code: 'AUTH_SESSION_REQUIRED' } } });
    return server.request(path, init);
  },
}));
jest.mock('../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));

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

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const correctAnswer = { choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true } as const;

let appStateListeners: ((state: string) => void)[] = [];

async function bringToForeground(): Promise<void> {
  await act(async () => {
    appStateListeners.forEach((listener) => listener('background'));
    appStateListeners.forEach((listener) => listener('active'));
  });
  await flush();
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

async function signIn(view: Awaited<ReturnType<typeof render>>, userId: string): Promise<void> {
  mockApi.activeUserId = userId;
  await view.rerender(<Harness userId={userId} />);
  await flush();
}

// Mounts as a guest, waits for the stats to hydrate, then signs userId in.
async function mountThenSignIn(userId: string) {
  const view = await render(<Harness userId={null} />);
  await flush();
  expect(latest.stats?.isHydrated).toBe(true);
  expect(latest.queue?.isUploadCapReached).toBe(false);
  await signIn(view, userId);
  return view;
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

function entryIn(log: LoggedAnswerEvent[], eventId: string): LoggedAnswerEvent | undefined {
  return log.find((entry) => entry.eventId === eventId);
}

// A server that already holds `remoteCount` events and refuses any upload
// that would store more than that: every POST is 422 SYNC_EVENT_CAP_REACHED.
function createCappedServer(remoteCount: number) {
  const server = createFakeSyncServer({ maxStoredEvents: remoteCount });
  const remote = Array.from({ length: remoteCount }, (_unused, index) => buildAnswerEvent(7000 + index));
  server.seed(remote);
  return { remote, server };
}

describe('useSyncQueue at the stored-event cap', () => {
  const userA = randomUUID();
  const userB = randomUUID();

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    await AsyncStorage.clear();
    mockApi.activeUserId = null;
    mockApi.servers = new Map();
    appStateListeners = [];
    latest.queue = null;
    latest.stats = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: string) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('exposes isUploadCapReached after a 422 SYNC_EVENT_CAP_REACHED, still downloads, and posts nothing on later passes', async () => {
    const { remote, server } = createCappedServer(2);
    mockApi.servers.set(userA, server);
    await seedEventLog(buildOwnedLog(3, userA));
    await mountThenSignIn(userA);

    const postsAfterFirstPass = server.postRequests().length;
    expect(postsAfterFirstPass).toBeGreaterThanOrEqual(1);
    expect(latest.queue?.isUploadCapReached).toBe(true);
    const stored = await readStoredLog();
    for (const id of idsOf(remote)) expect(entryIn(stored, id)).toMatchObject({ isSynced: true, ownerUserId: userA });
    const downloadsAfterFirstPass = server.getRequests().length;

    await recordNewAnswer();
    await bringToForeground();
    await advance(20 * MINUTE);
    await act(async () => {
      await latest.queue?.syncNow();
    });
    await flush();

    expect(server.postRequests()).toHaveLength(postsAfterFirstPass);
    expect(server.getRequests().length).toBeGreaterThan(downloadsAfterFirstPass);
    expect(latest.queue?.isUploadCapReached).toBe(true);
  });

  it('does not block another user on the same device: B uploads and sees isUploadCapReached false', async () => {
    const { server: serverA } = createCappedServer(2);
    const serverB = createFakeSyncServer();
    mockApi.servers.set(userA, serverA);
    mockApi.servers.set(userB, serverB);
    const ownedByA = buildOwnedLog(3, userA);
    const ownedByB = buildOwnedLog(3, userB, 100);
    await seedEventLog([...ownedByA, ...ownedByB]);
    const view = await mountThenSignIn(userA);
    expect(latest.queue?.isUploadCapReached).toBe(true);
    const postsByA = serverA.postRequests().length;

    await signIn(view, userB);

    expect(latest.queue?.isUploadCapReached).toBe(false);
    expect([...serverB.storedIds()].sort()).toEqual(idsOf(ownedByB).sort());
    const stored = await readStoredLog();
    for (const entry of ownedByB) expect(entryIn(stored, entry.eventId)?.isSynced).toBe(true);
    expect(serverA.postRequests()).toHaveLength(postsByA);

    // The flag lasts one sign-in: A's next one tries the upload again.
    await signIn(view, userA);

    expect(serverA.postRequests().length).toBeGreaterThan(postsByA);
    expect(latest.queue?.isUploadCapReached).toBe(true);
  });
});

describe('useSyncQueue held events', () => {
  const userA = randomUUID();

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    await AsyncStorage.clear();
    mockApi.activeUserId = null;
    mockApi.servers = new Map();
    latest.queue = null;
    latest.stats = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      () => ({ remove: () => undefined }) as ReturnType<typeof AppState.addEventListener>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stores the event a 422 SYNC_INVALID_EVENTS names as held, and leaves isUploadCapReached false', async () => {
    const log = buildOwnedLog(3, userA);
    const server = createFakeSyncServer({ rejectedEventIds: new Set([log[1].eventId]) });
    mockApi.servers.set(userA, server);
    await seedEventLog(log);
    await mountThenSignIn(userA);

    const stored = await readStoredLog();
    expect(entryIn(stored, log[1].eventId)).toMatchObject({ isHeld: true, isSynced: false });
    for (const entry of [log[0], log[2]]) expect(entryIn(stored, entry.eventId)).toMatchObject({ isHeld: false, isSynced: true });
    expect(latest.queue?.isUploadCapReached).toBe(false);
  });
});
