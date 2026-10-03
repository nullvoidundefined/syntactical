// useSyncQueue races (Task 3.11 hardening; B-36, B-61): syncNow called while
// an earlier pass is in flight runs one follow-up pass after it, so an answer
// recorded after that pass began is uploaded before syncNow resolves true;
// after unmount neither an AppState event nor any timer sends a request; and
// while a retry is pending the backoff, not the 5-minute interval, decides
// when the next request goes out. Real StatsProvider and runSyncPass, with
// apiFetch routed to a fake server per signed-in account.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { buildOwnedLog } from '../../services/sync/__tests__/fakeSyncServer';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { useSyncQueue } from '../useSyncQueue';
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

// AppState listeners stay registered after remove(), standing in for a
// change event already on its way when the component unmounts.
let appStateListeners: ((state: string) => void)[] = [];

function emitAppState(state: string): Promise<void> {
  return act(async () => {
    appStateListeners.forEach((listener) => listener(state));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

function isUpload(path: string, method: string): boolean {
  return method === 'POST' && path === 'answer-events';
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

describe('useSyncQueue races', () => {
  const userA = randomUUID();
  let router: ApiRouter;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
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

  it('syncNow during a pass that began earlier runs one follow-up pass, so an answer recorded mid-pass is uploaded and synced before syncNow resolves true', async () => {
    const ownedByA = buildOwnedLog(3, userA);
    await seedEventLog(ownedByA);
    const hold = router.holdNext(isUpload);
    await mountThenSignIn(router, userA);
    expect(hold.isReached()).toBe(true);

    const lateId = await recordNewAnswer();
    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = latest.queue?.syncNow();
    });
    hold.release();
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await pending;
    });

    expect(resolved).toBe(true);
    const server = router.serverFor(userA);
    expect(server.storedIds().has(lateId)).toBe(true);
    expect([...server.storedIds()].sort()).toEqual([...idsOf(ownedByA), lateId].sort());
    expect(entryIn(await readStoredLog(), lateId)?.isSynced).toBe(true);
    expect(router.state.maxInFlight).toBe(1);
  });

  it('after unmount, an AppState active event sends no request', async () => {
    await seedEventLog(buildOwnedLog(3, userA));
    const view = await mountThenSignIn(router, userA);
    expect(router.serverFor(userA).storedIds().size).toBe(3);
    const sentBefore = router.sent.length;

    await view.unmount();
    await emitAppState('background');
    await emitAppState('active');
    await flush();

    expect(router.sent.slice(sentBefore)).toEqual([]);
  });

  it('after unmount with a retry pending, 20 minutes of timers send no request', async () => {
    await seedEventLog(buildOwnedLog(3, userA));
    router.state.isFailing = true;
    const view = await mountThenSignIn(router, userA);
    expect(router.serverFor(userA).postRequests()).toHaveLength(1);
    const sentBefore = router.sent.length;

    await view.unmount();
    router.state.isFailing = false;
    await advance(20 * MINUTE);

    expect(router.sent.slice(sentBefore)).toEqual([]);
  });

  it('while a retry is pending, the 5-minute interval sends no request before the backoff delay ends', async () => {
    await seedEventLog(buildOwnedLog(3, userA));
    router.state.isFailing = true;
    await mountThenSignIn(router, userA);
    // A failed upload is followed by a download, so passes are counted by
    // their upload attempts.
    const attempts = () => router.serverFor(userA).postRequests().length;
    expect(attempts()).toBe(1);

    // Failures at 0 s, then retries at 30, 90, 210, 450, and 930 s; the
    // interval ticks at 300, 600, and 900 s fall inside pending backoffs.
    await advance(30 * SECOND);
    expect(attempts()).toBe(2);
    await advance(60 * SECOND);
    expect(attempts()).toBe(3);
    await advance(120 * SECOND);
    expect(attempts()).toBe(4);

    await advance(90 * SECOND);
    expect(attempts()).toBe(4);
    await advance(150 * SECOND - SECOND);
    expect(attempts()).toBe(4);
    await advance(SECOND);
    expect(attempts()).toBe(5);

    await advance(150 * SECOND);
    expect(attempts()).toBe(5);
    await advance(300 * SECOND);
    expect(attempts()).toBe(5);
    await advance(30 * SECOND - SECOND);
    expect(attempts()).toBe(5);
    await advance(SECOND);
    expect(attempts()).toBe(6);
  });
});
