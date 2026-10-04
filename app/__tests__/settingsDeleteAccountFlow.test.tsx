// B-59c: account deletion from the settings screen with real wiring: real
// AuthProvider and StatsProvider, the real apiFetch and its 401 handler
// (global fetch is routed, clients/onUnauthorized is not mocked). On 204 the
// deleted user's id is recorded in the durable pending-purge list before the
// sign-out, the user is signed out, that user's events and stats key leave the
// device, guest events stay, the list ends empty, and no promise rejection goes
// unhandled. On 401 the "session ended" alert stays visible on the settings
// screen after the sign-out and nothing local is deleted. A network failure
// logs exactly one warning with no user id and shows the generic failure. Two
// presses in one tick send one DELETE me. Jest fails the running test on any
// unhandled promise rejection (a process listener never sees one under Jest),
// and each test settles the flow before it ends, so "no unhandled rejection"
// is enforced by the runner itself.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import '../../components/auth/__tests__/preloadNativeModal';
import { createQueryClient } from '../../config/queryClient';
import { AUTH_STORAGE_KEY, buildUserStatsKey } from '../../constants/appConfig';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { createEmptyStats } from '../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { buildOwnedLog } from '../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
import { StatsProvider, useQuizStats } from '../../state/StatsProvider';
import {
  SESSION_TOKEN_KEY,
  buildIdentity,
  captureConsole,
  holdReply,
  installRoutedFetch,
  type RouteReply,
  type RoutedRequest,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { flush, idsOf, readStoredLog, seedEventLog } from '../../state/__tests__/syncTestSupport';
import SettingsScreen from '../settings';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    mockValues: values,
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

jest.mock('../../state/SyncProvider', () => ({
  useSync: () => ({ cancelPass: () => undefined, isSyncing: false, isUploadCapReached: false, syncNow: () => Promise.resolve(true) }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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

const secureStore = jest.requireMock('expo-secure-store') as { mockValues: Map<string, string> };

const PENDING_PURGE_STORAGE_KEY = 'syntactical.account.pending-purge.v1';
const SESSION_ENDED = 'Your session has ended. Sign in again to delete your account.';
const GENERIC_FAILURE = 'Your account could not be deleted. Check your connection and try again.';
const PROFILE_BODY = { data: { dailyGoal: 20, dayStreak: 0, entitlements: [], timezone: 'UTC', xpToday: 0 } };

type AuthValue = ReturnType<typeof useAuth>;
const latest: { auth: AuthValue | null; isStatsHydrated: boolean } = { auth: null, isStatsHydrated: false };

function Probe() {
  latest.auth = useAuth();
  latest.isStatsHydrated = useQuizStats().isHydrated;
  return null;
}

function OwnedStats({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

function App() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <OwnedStats>
          <SettingsScreen />
          <Probe />
        </OwnedStats>
      </AuthProvider>
    </QueryClientProvider>
  );
}

type Seeded = { userEvents: LoggedAnswerEvent[]; guestEvents: LoggedAnswerEvent[]; userStatsText: string };

// A device signed in as the identity (stored identity and native session
// value), with that user's events, guest events, and the user's stats key.
async function seedSignedInDevice(identity: SignInIdentity): Promise<Seeded> {
  const userEvents = buildOwnedLog(3, identity.userId).map((entry) => ({ ...entry, isSynced: true }));
  const guestEvents = buildOwnedLog(2, null, 20);
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }));
  secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
  await seedEventLog([...guestEvents, ...userEvents]);
  const empty = createEmptyStats(readLocalToday());
  const userStatsText = JSON.stringify({ ...empty, totals: { ...empty.totals, attempted: 3, correct: 3 } });
  await AsyncStorage.setItem(buildUserStatsKey(identity.userId), userStatsText);
  return { guestEvents, userEvents, userStatsText };
}

async function mountSignedIn(identity: SignInIdentity) {
  const view = await render(<App />);
  await waitFor(() => {
    expect(latest.auth?.user).toEqual({ id: identity.userId });
    expect(latest.isStatsHydrated).toBe(true);
  });
  await screen.findByRole('button', { name: 'Delete account' });
  await flush();
  return view;
}

function queryDialog() {
  const found = screen.container.queryAll(
    (node) => node.props.role === 'dialog' || node.props.accessibilityRole === 'dialog',
  );
  return found.length === 0 ? null : found[0];
}

async function openAndType() {
  await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  await waitFor(() => expect(queryDialog()).not.toBeNull());
  const dialog = queryDialog() as NonNullable<ReturnType<typeof queryDialog>>;
  await fireEvent.changeText(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE');
  return dialog;
}

async function confirmDeletion(): Promise<void> {
  const dialog = await openAndType();
  await fireEvent.press(within(dialog).getByRole('button', { name: 'Delete my account' }));
}

type FiberLike = { memoizedProps?: Record<string, unknown> | null; return: FiberLike | null };

// The press handler the button's own component received, read the way the
// testing library finds it, so it can be called twice without a render between.
function readPressHandler(node: { unstable_fiber?: unknown }): () => void {
  let fiber = (node.unstable_fiber ?? null) as FiberLike | null;
  while (fiber !== null) {
    const handler = fiber.memoizedProps?.onPress;
    if (typeof handler === 'function') return handler as () => void;
    fiber = fiber.return;
  }
  throw new Error('no press handler found');
}

function accountDeletes(requests: RoutedRequest[]): RoutedRequest[] {
  return requests.filter(({ method, path }) => method === 'DELETE' && path === 'me');
}

async function readPendingPurge(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(PENDING_PURGE_STORAGE_KEY);
  return raw === null ? [] : (JSON.parse(raw) as string[]);
}

function routes(deleteReply: RouteReply): Record<string, RouteReply> {
  return { 'DELETE me': deleteReply, 'GET me': { status: 200, body: PROFILE_BODY } };
}

// logWarning writes one JSON line with level "warn".
function isLogWarningLine(line: string): boolean {
  try {
    return (JSON.parse(line) as { level?: unknown }).level === 'warn';
  } catch {
    return false;
  }
}

// Records every AsyncStorage.setItem in order, so a test can tell which write
// reached storage first.
const setItemMock = AsyncStorage.setItem as unknown as jest.Mock;
const originalSetItem = setItemMock.getMockImplementation();
let storageWrites: { key: string; value: string }[] = [];

describe('SettingsScreen account deletion flow (real auth, stats, and 401 handling)', () => {
  let identity: SignInIdentity;

  beforeEach(async () => {
    await AsyncStorage.clear();
    secureStore.mockValues.clear();
    identity = buildIdentity();
    latest.auth = null;
    latest.isStatsHydrated = false;
    storageWrites = [];
    setItemMock.mockImplementation(async (key: string, value: string) => {
      storageWrites.push({ key, value });
      return originalSetItem?.(key, value);
    });
  });

  afterEach(async () => {
    await flush(100);
    setItemMock.mockImplementation(originalSetItem);
    jest.restoreAllMocks();
  });

  it('on 204, records the id as pending before signing out, then signs out, removes that user\'s events and stats key, keeps guest events, empties the list, and leaves no rejection unhandled', async () => {
    const { guestEvents, userEvents } = await seedSignedInDevice(identity);
    const { requests } = installRoutedFetch(routes({ status: 204 }));
    await mountSignedIn(identity);
    storageWrites = [];

    await confirmDeletion();

    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await waitFor(async () => expect(await AsyncStorage.getItem(buildUserStatsKey(identity.userId))).toBeNull());
    await waitFor(async () => expect(await readPendingPurge()).toEqual([]));
    await flush(100);

    expect(accountDeletes(requests)).toHaveLength(1);
    const stored = await readStoredLog();
    expect(stored.filter(({ ownerUserId }) => ownerUserId === identity.userId)).toEqual([]);
    const storedIds = new Set(idsOf(stored));
    for (const id of idsOf(userEvents)) expect(storedIds.has(id)).toBe(false);
    for (const id of idsOf(guestEvents)) expect(storedIds.has(id)).toBe(true);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();

    const pendingRecorded = storageWrites.findIndex(
      ({ key, value }) => key === PENDING_PURGE_STORAGE_KEY && (JSON.parse(value) as unknown[]).includes(identity.userId),
    );
    const signedOutWritten = storageWrites.findIndex(
      ({ key, value }) => key === AUTH_STORAGE_KEY && (JSON.parse(value) as { userId: unknown }).userId === null,
    );
    expect(pendingRecorded).toBeGreaterThanOrEqual(0);
    expect(signedOutWritten).toBeGreaterThanOrEqual(0);
    expect(pendingRecorded).toBeLessThan(signedOutWritten);
  });

  it('on 204 when the stats key cannot be removed, keeps the id pending, and the next launch purges it', async () => {
    await seedSignedInDevice(identity);
    installRoutedFetch(routes({ status: 204 }));
    const userKey = buildUserStatsKey(identity.userId);
    const removeItemMock = AsyncStorage.removeItem as unknown as jest.Mock;
    const originalRemoveItem = removeItemMock.getMockImplementation();
    let failedRemovals = 0;
    removeItemMock.mockImplementation(async (key: string) => {
      if (key === userKey) {
        failedRemovals += 1;
        throw new Error('storage unavailable');
      }
      return originalRemoveItem?.(key);
    });
    const consoleCapture = captureConsole();
    try {
      const firstLaunch = await mountSignedIn(identity);
      await confirmDeletion();
      await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
      await waitFor(() => expect(failedRemovals).toBeGreaterThan(0));
      await flush(100);

      expect(await readPendingPurge()).toEqual([identity.userId]);
      expect(consoleCapture.serialised()).not.toContain(identity.userId);

      // Next launch, storage recovered.
      await act(async () => firstLaunch.unmount());
      removeItemMock.mockImplementation(originalRemoveItem);
      await render(<App />);
      await waitFor(() => expect(latest.isStatsHydrated).toBe(true));
      await waitFor(async () => expect(await AsyncStorage.getItem(userKey)).toBeNull());
      await waitFor(async () => expect(await readPendingPurge()).toEqual([]));
      expect((await readStoredLog()).filter(({ ownerUserId }) => ownerUserId === identity.userId)).toEqual([]);
    } finally {
      removeItemMock.mockImplementation(originalRemoveItem);
      consoleCapture.restore();
    }
  });

  it('on 401, keeps "session ended" in an alert on the settings screen after the sign-out and deletes no local data', async () => {
    const seeded = await seedSignedInDevice(identity);
    const { requests } = installRoutedFetch(routes({ status: 401, body: { error: { code: 'UNAUTHORIZED' } } }));
    await mountSignedIn(identity);
    const logBefore = await readStoredLog();

    await confirmDeletion();

    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy());
    await flush(100);

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((alert) => within(alert).queryByText(SESSION_ENDED) !== null || alert.props.children === SESSION_ENDED)).toBe(true);
    expect(screen.getByText(SESSION_ENDED)).toBeOnTheScreen();
    expect(accountDeletes(requests)).toHaveLength(1);
    expect(await readStoredLog()).toEqual(logBefore);
    expect(await AsyncStorage.getItem(buildUserStatsKey(identity.userId))).toBe(seeded.userStatsText);
    expect(await readPendingPurge()).toEqual([]);
  });

  it('on a network failure, logs exactly one warning with no user id or session value and shows the generic failure', async () => {
    const seeded = await seedSignedInDevice(identity);
    installRoutedFetch(routes('reject'));
    await mountSignedIn(identity);
    const consoleCapture = captureConsole();
    try {
      await confirmDeletion();
      await waitFor(() => expect(screen.getByText(GENERIC_FAILURE)).toBeOnTheScreen());
      await flush(100);

      const warnLines = consoleCapture
        .serialisedFor('warn')
        .split('\n')
        .filter((line) => line.trim() !== '');
      expect(warnLines.filter(isLogWarningLine)).toHaveLength(1);
      const everything = consoleCapture.serialised();
      expect(everything).not.toContain(identity.userId);
      expect(everything).not.toContain(identity.sessionValue);
    } finally {
      consoleCapture.restore();
    }
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(await AsyncStorage.getItem(buildUserStatsKey(identity.userId))).toBe(seeded.userStatsText);
    expect(await readPendingPurge()).toEqual([]);
  });

  it('two presses of Delete my account in the same tick send exactly one DELETE me', async () => {
    await seedSignedInDevice(identity);
    const held = holdReply();
    const { requests } = installRoutedFetch(routes(held));
    await mountSignedIn(identity);
    const dialog = await openAndType();
    const confirm = within(dialog).getByRole('button', { name: 'Delete my account' });

    const press = readPressHandler(confirm);
    // Both presses run back to back in one tick, before any re-render can disable the button.
    await act(async () => {
      press();
      press();
    });
    await flush();
    expect(accountDeletes(requests)).toHaveLength(1);
    await act(async () => held.release({ status: 204 }));
    await flush();
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await flush(100);

    expect(accountDeletes(requests)).toHaveLength(1);
  });
});
