// useSyncQueue (Task 3.11; B-36, B-61): when a pass runs (sign-in, return to
// the foreground, every 5 minutes while online), never for a guest, never two
// at once, backoff after a failure, syncNow, and a pass whose user changes
// mid-flight uploading and merging nothing more. Runs against the real
// StatsProvider and the real runSyncPass, with apiFetch routed to a fake
// server per signed-in account.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { buildAnswerEvent, buildOwnedLog } from '../../services/sync/__tests__/fakeSyncServer';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { useSyncQueue } from '../useSyncQueue';
import {
  createApiRouter,
  flush,
  idsOf,
  readStoredLog,
  readStoredStats,
  seedEventLog,
  type ApiRouter,
} from './syncTestSupport';

const mockApi: { router: ApiRouter | null } = { router: null };

jest.mock('../../clients/apiClient', () => ({
  apiFetch: (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    if (!mockApi.router) throw new Error('no router installed');
    return mockApi.router.request(path, init);
  },
  getLatestRequestSeq: () => 0,
  onUnauthorized: () => () => undefined,
}));

type NetListener = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;
const mockNet = { isConnected: true, listeners: new Set<NetListener>() };

jest.mock('@react-native-community/netinfo', () => {
  function currentState() {
    return { isConnected: mockNet.isConnected, isInternetReachable: mockNet.isConnected, type: 'wifi' };
  }
  const api = {
    addEventListener: (listener: NetListener) => {
      mockNet.listeners.add(listener);
      listener(currentState());
      return () => {
        mockNet.listeners.delete(listener);
      };
    },
    fetch: () => Promise.resolve(currentState()),
    useNetInfo: () => currentState(),
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

function emitAppState(state: string): Promise<void> {
  return act(async () => {
    appStateListeners.forEach((listener) => listener(state));
  });
}

function setOnline(isConnected: boolean): Promise<void> {
  mockNet.isConnected = isConnected;
  return act(async () => {
    mockNet.listeners.forEach((listener) => listener({ isConnected, isInternetReachable: isConnected }));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

// Mounts as a guest, waits for the stats to hydrate, then signs userId in.
async function mountThenSignIn(router: ApiRouter, userId: string) {
  const view = await render(<Harness userId={null} />);
  await flush();
  expect(latest.stats?.isHydrated).toBe(true);
  router.state.activeUserId = userId;
  await view.rerender(<Harness userId={userId} />);
  await flush();
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

describe('useSyncQueue', () => {
  const userA = randomUUID();
  const userB = randomUUID();
  let router: ApiRouter;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    mockNet.isConnected = true;
    mockNet.listeners.clear();
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

  it('runs a pass as soon as the user id becomes non-null, uploading only that user\'s events and marking them synced', async () => {
    const ownedByA = buildOwnedLog(3, userA);
    const guest = buildOwnedLog(2, null, 10);
    await seedEventLog([...ownedByA, ...guest]);
    await mountThenSignIn(router, userA);
    const server = router.serverFor(userA);
    expect([...server.storedIds()].sort()).toEqual(idsOf(ownedByA).sort());
    const stored = await readStoredLog();
    for (const entry of ownedByA) expect(entryIn(stored, entry.eventId)).toEqual({ ...entry, isSynced: true });
    for (const entry of guest) expect(entryIn(stored, entry.eventId)).toEqual(entry);
  });

  it('never runs a pass for a null user id: no request on mount, foreground, interval, or syncNow', async () => {
    await seedEventLog(buildOwnedLog(3, null));
    await render(<Harness userId={null} />);
    await flush();
    await emitAppState('background');
    await emitAppState('active');
    await advance(20 * MINUTE);
    let result: boolean | undefined;
    await act(async () => {
      result = await latest.queue?.syncNow();
    });
    expect(result).toBe(false);
    expect(router.sent).toEqual([]);
  });

  it('runs a pass when the app returns to the foreground', async () => {
    await mountThenSignIn(router, userA);
    const eventId = await recordNewAnswer();
    await emitAppState('background');
    await flush();
    await emitAppState('active');
    await flush();
    expect(router.serverFor(userA).storedIds().has(eventId)).toBe(true);
    expect(entryIn(await readStoredLog(), eventId)?.isSynced).toBe(true);
  });

  it('runs a pass every 5 minutes while online, and none while offline', async () => {
    await mountThenSignIn(router, userA);
    const server = router.serverFor(userA);
    const firstId = await recordNewAnswer();
    await advance(5 * MINUTE - SECOND);
    expect(server.storedIds().has(firstId)).toBe(false);
    await advance(SECOND);
    expect(server.storedIds().has(firstId)).toBe(true);

    await setOnline(false);
    const offlineId = await recordNewAnswer();
    await advance(16 * MINUTE);
    expect(server.storedIds().has(offlineId)).toBe(false);
    expect(entryIn(await readStoredLog(), offlineId)?.isSynced).toBe(false);
  });

  it('never runs two passes at once: foreground, interval, and syncNow during a pass start no second pass', async () => {
    const ownedByA = buildOwnedLog(400, userA);
    await seedEventLog(ownedByA);
    const hold = router.holdNext((path, method) => method === 'POST' && path === 'answer-events');
    await mountThenSignIn(router, userA);
    expect(hold.isReached()).toBe(true);
    await emitAppState('background');
    await emitAppState('active');
    let syncNowResult: Promise<boolean> | undefined;
    await act(async () => {
      syncNowResult = latest.queue?.syncNow();
    });
    await advance(5 * MINUTE);
    expect(router.sent.filter(({ method }) => method === 'POST')).toHaveLength(1);
    expect(router.state.maxInFlight).toBe(1);

    hold.release();
    await flush(200);
    let resolved: unknown;
    await act(async () => {
      resolved = await syncNowResult;
    });
    expect(resolved).toBe(true);
    expect(router.state.maxInFlight).toBe(1);
    expect([...router.serverFor(userA).storedIds()].sort()).toEqual(idsOf(ownedByA).sort());
  });

  it('retries a failed pass after 30 s, doubling each time up to a 15-minute cap, and resets the backoff after a success', async () => {
    await seedEventLog(buildOwnedLog(3, userA));
    router.state.isFailing = true;
    await mountThenSignIn(router, userA);
    // A failed upload is followed by a download, so passes are counted by
    // their upload attempts.
    const attempts = () => router.serverFor(userA).postRequests().length;
    expect(attempts()).toBe(1);
    const delaysInSeconds = [30, 60, 120, 240, 480, 900, 900];
    for (const delay of delaysInSeconds) {
      const before = attempts();
      await advance(delay * SECOND - SECOND);
      expect(attempts()).toBe(before);
      await advance(SECOND);
      expect(attempts()).toBe(before + 1);
    }

    router.state.isFailing = false;
    await advance(15 * MINUTE);
    expect(router.serverFor(userA).storedIds().size).toBe(3);

    // After a success the next failure is retried 30 s later, not 15 minutes.
    // A new answer gives that failing pass something to upload.
    router.state.isFailing = true;
    await recordNewAnswer();
    const beforeFailure = attempts();
    await emitAppState('background');
    await emitAppState('active');
    await flush();
    expect(attempts()).toBe(beforeFailure + 1);
    await advance(30 * SECOND - SECOND);
    expect(attempts()).toBe(beforeFailure + 1);
    await advance(SECOND);
    expect(attempts()).toBe(beforeFailure + 2);
  });

  it('syncNow runs a pass at once and resolves true when it succeeds, false when it fails', async () => {
    const ownedByA = buildOwnedLog(3, userA);
    await seedEventLog(ownedByA);
    router.state.isFailing = true;
    await mountThenSignIn(router, userA);
    router.state.isFailing = false;
    let result: boolean | undefined;
    await act(async () => {
      result = await latest.queue?.syncNow();
    });
    expect(result).toBe(true);
    expect([...router.serverFor(userA).storedIds()].sort()).toEqual(idsOf(ownedByA).sort());
    expect((await readStoredLog()).every(({ isSynced }) => isSynced)).toBe(true);

    router.state.isFailing = true;
    const eventId = await recordNewAnswer();
    await act(async () => {
      result = await latest.queue?.syncNow();
    });
    expect(result).toBe(false);
    expect(entryIn(await readStoredLog(), eventId)?.isSynced).toBe(false);
  });

  it('stops a pass when the user changes mid-upload: none of A\'s events reach B\'s account, and B\'s passes upload only B\'s events', async () => {
    const ownedByA = buildOwnedLog(400, userA);
    const ownedByB = buildOwnedLog(3, userB, 1000);
    await seedEventLog([...ownedByA, ...ownedByB]);
    const hold = router.holdNext((path, method) => method === 'POST' && path === 'answer-events');
    const view = await mountThenSignIn(router, userA);
    expect(hold.isReached()).toBe(true);

    router.state.activeUserId = userB;
    await view.rerender(<Harness userId={userB} />);
    await flush();
    hold.release();
    await flush(200);
    await emitAppState('background');
    await emitAppState('active');
    await flush(200);

    const serverA = router.serverFor(userA);
    const serverB = router.serverFor(userB);
    expect(serverA.postRequests()).toHaveLength(1);
    const idsOfA = new Set(idsOf(ownedByA));
    expect([...serverB.storedIds()].filter((id) => idsOfA.has(id))).toEqual([]);
    expect([...serverB.storedIds()].sort()).toEqual(idsOf(ownedByB).sort());
    const stored = await readStoredLog();
    for (const entry of ownedByA.slice(200)) expect(entryIn(stored, entry.eventId)).toEqual(entry);
    expect(idsOf(latest.stats?.eventLog ?? []).filter((id) => idsOfA.has(id))).toEqual([]);
  });

  it('merges nothing from A\'s pass under B when the user changes during the download', async () => {
    router = createApiRouter({ pageSize: 2 });
    mockApi.router = router;
    const fromOtherDevice = [buildAnswerEvent(1), buildAnswerEvent(2), buildAnswerEvent(3)];
    router.serverFor(userA).seed(fromOtherDevice);
    const hold = router.holdNext((path, method) => method === 'GET' && path.startsWith('answer-events'));
    const view = await mountThenSignIn(router, userA);
    expect(hold.isReached()).toBe(true);

    router.state.activeUserId = userB;
    await view.rerender(<Harness userId={userB} />);
    await flush();
    hold.release();
    await flush(200);

    const downloadedIds = new Set(idsOf(fromOtherDevice));
    const stored = await readStoredLog();
    expect(stored.filter(({ eventId }) => downloadedIds.has(eventId))).toEqual([]);
    expect(idsOf(latest.stats?.eventLog ?? []).filter((id) => downloadedIds.has(id))).toEqual([]);
    expect((await readStoredStats())?.syncCursor).toBeUndefined();
  });

  it('stops a pass when the user signs out mid-upload: nothing more is sent', async () => {
    await seedEventLog(buildOwnedLog(400, userA));
    const hold = router.holdNext((path, method) => method === 'POST' && path === 'answer-events');
    const view = await mountThenSignIn(router, userA);
    expect(hold.isReached()).toBe(true);

    router.state.activeUserId = null;
    await view.rerender(<Harness userId={null} />);
    await flush();
    hold.release();
    await flush(200);
    await advance(20 * MINUTE);

    expect(router.serverFor(userA).requests).toHaveLength(1);
    expect(router.syncRequestsWithoutSession()).toEqual([]);
  });
});
