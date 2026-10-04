// SignOutDialog (Task 3.11; B-61, B-64): its "Sign out" control signs out at
// once when the signed-in user has no unsynced events; otherwise it opens a
// modal dialog offering "Sync now", "Discard", and "Cancel". Sync now signs
// out only after every event synced and announces a failed pass in an alert;
// Discard removes that user's events and signs out. Every sign-out clears
// the sync cursor and removes the user's events from the device, so the guest
// that follows sees none of them. Real AuthProvider, StatsProvider, SyncProvider, and
// runSyncPass; apiFetch routed to a fake server per signed-in account.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AUTH_STORAGE_KEY, buildUserStatsKey } from '../../../constants/appConfig';
import { readLocalToday } from '../../../services/progress/readLocalToday';
import { createEmptyStats } from '../../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../../services/stats/types/LoggedAnswerEvent';
import type { Stats } from '../../../services/stats/types/Stats';
import { buildOwnedLog } from '../../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../../../state/AuthProvider';
import { StatsProvider, useQuizStats } from '../../../state/StatsProvider';
import { SyncProvider } from '../../../state/SyncProvider';
import {
  createApiRouter,
  flush,
  idsOf,
  readStoredLog,
  seedEventLog,
  seedStats,
  type ApiRouter,
} from '../../../state/__tests__/syncTestSupport';
import './preloadNativeModal';
import { SignOutDialog } from '../SignOutDialog';

const mockApi: { router: ApiRouter | null } = { router: null };

jest.mock('../../../clients/apiClient', () => ({
  apiFetch: (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    if (!mockApi.router) throw new Error('no router installed');
    return mockApi.router.request(path, init);
  },
}));
jest.mock('../../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));

// How long deleting the session value takes; a delay lets the guest's stats
// load before sign-out finishes.
const mockSecureStoreDelete = { delayMs: 0 };

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
      return new Promise((resolve) => setTimeout(resolve, mockSecureStoreDelete.delayMs));
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

function OwnedStats({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

function App() {
  return (
    <AuthProvider>
      <OwnedStats>
        <SyncProvider>
          <SignOutDialog />
          <Probe />
        </SyncProvider>
      </OwnedStats>
    </AuthProvider>
  );
}

const SIGN_OUT = 'Sign out';

function sessionDeletes(router: ApiRouter) {
  return router.sent.filter(({ method, path }) => method === 'DELETE' && path === 'auth/sessions/current');
}

// A signed-in user's stats, sync cursor included, live under that user's key.
async function seedUserStats(userId: string, change: Partial<Stats>): Promise<void> {
  await AsyncStorage.setItem(buildUserStatsKey(userId), JSON.stringify({ ...createEmptyStats(readLocalToday()), ...change }));
}

async function readUserStats(userId: string): Promise<Stats | null> {
  return JSON.parse((await AsyncStorage.getItem(buildUserStatsKey(userId))) ?? 'null');
}

function entryIn(log: LoggedAnswerEvent[], eventId: string): LoggedAnswerEvent | undefined {
  return log.find((entry) => entry.eventId === eventId);
}

// Mounts signed in as userId with the given log and a stored sync cursor,
// and waits for the sign-in pass to finish.
async function mountSignedIn(router: ApiRouter, userId: string, log: LoggedAnswerEvent[]): Promise<void> {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  router.state.activeUserId = userId;
  await seedEventLog(log);
  await seedUserStats(userId, { syncCursor: router.serverFor(userId).issueCursor(0) });
  await render(<App />);
  await waitFor(() => {
    expect(latest.auth?.user).toEqual({ id: userId });
    expect(latest.stats?.isHydrated).toBe(true);
  });
  await waitFor(() => expect(router.serverFor(userId).requests.length).toBeGreaterThan(0));
  await flush();
}

type Node = ReturnType<typeof screen.getByRole>;

// A modal View with role="dialog" is not itself an accessibility element (its
// buttons must stay reachable), so it is found by its role prop.
function queryDialog(): Node | null {
  const found = screen.container.queryAll(
    (node) => node.props.role === 'dialog' || node.props.accessibilityRole === 'dialog',
  );
  return found.length === 0 ? null : (found[0] as Node);
}

function textOf(node: Node | string): string {
  if (typeof node === 'string') return node;
  return (node.children as (Node | string)[]).map(textOf).join('');
}

async function openDialog(): Promise<Node> {
  fireEvent.press(screen.getByRole('button', { name: SIGN_OUT }));
  await waitFor(() => expect(queryDialog()).not.toBeNull());
  return queryDialog() as Node;
}

describe('SignOutDialog', () => {
  const userId = randomUUID();
  let router: ApiRouter;
  let unsynced: LoggedAnswerEvent[];
  let synced: LoggedAnswerEvent[];

  beforeEach(async () => {
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    mockSecureStoreDelete.delayMs = 0;
    latest.auth = null;
    latest.stats = null;
    unsynced = buildOwnedLog(3, userId);
    synced = buildOwnedLog(2, userId, 10).map((entry) => ({ ...entry, isSynced: true }));
    // The sign-in pass fails, so the unsynced events are still unsynced when
    // the user asks to sign out.
    router.state.isFailing = true;
  });

  it('with unsynced events opens a labeled modal dialog offering Sync now, Discard, and Cancel, without signing out', async () => {
    await mountSignedIn(router, userId, [...unsynced, ...synced]);
    const dialog = await openDialog();
    expect(dialog.props['aria-modal'] ?? dialog.props.accessibilityViewIsModal).toBe(true);
    const heading = within(dialog).getByRole('heading');
    const headingText = textOf(heading).trim();
    expect(headingText.length).toBeGreaterThan(0);
    const labelledBy = dialog.props['aria-labelledby'] ?? dialog.props.accessibilityLabelledBy;
    const isLabelledByHeading = labelledBy !== undefined && labelledBy === heading.props.nativeID;
    const isLabelledWithHeadingText = (dialog.props['aria-label'] ?? dialog.props.accessibilityLabel) === headingText;
    expect(isLabelledByHeading || isLabelledWithHeadingText).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Sync now' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Discard' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(sessionDeletes(router)).toEqual([]);
  });

  it('Sync now uploads every unsynced event that is not held, then signs out, clears the sync cursor, and removes the user\'s events from the device', async () => {
    const held = buildOwnedLog(1, userId, 20).map((entry) => ({ ...entry, isHeld: true }));
    await mountSignedIn(router, userId, [...unsynced, ...held, ...synced]);
    const dialog = await openDialog();
    // A held answer is never uploaded, so the dialog says it goes with sign-out.
    expect(textOf(dialog)).toContain('Answers the server refused cannot sync and are discarded at sign-out.');
    router.state.isFailing = false;
    fireEvent.press(within(dialog).getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await flush();

    const server = router.serverFor(userId);
    for (const id of idsOf(unsynced)) expect(server.storedIds().has(id)).toBe(true);
    for (const id of idsOf(held)) expect(server.storedIds().has(id)).toBe(false);
    const lastUpload = router.sent.map(({ method }) => method).lastIndexOf('POST');
    const signOutAt = router.sent.findIndex(({ method, path }) => method === 'DELETE' && path === 'auth/sessions/current');
    expect(signOutAt).toBeGreaterThan(lastUpload);
    expect(await readStoredLog()).toEqual([]);
    expect((await readUserStats(userId))?.syncCursor).toBeUndefined();
    expect(latest.stats?.eventLog).toEqual([]);
    expect(queryDialog()).toBeNull();
  });

  it('Sync now that fails keeps the dialog open, announces the failure in an alert, and stays signed in', async () => {
    await mountSignedIn(router, userId, [...unsynced, ...synced]);
    const dialog = await openDialog();
    const postsBefore = router.serverFor(userId).postRequests().length;
    fireEvent.press(within(dialog).getByRole('button', { name: 'Sync now' }));
    const alert = await screen.findByRole('alert');
    expect(textOf(alert).trim().length).toBeGreaterThan(0);
    expect(router.serverFor(userId).postRequests().length).toBeGreaterThan(postsBefore);
    expect(queryDialog()).not.toBeNull();
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(sessionDeletes(router)).toEqual([]);
    const stored = await readStoredLog();
    for (const entry of unsynced) expect(entryIn(stored, entry.eventId)).toEqual(entry);
    expect((await readUserStats(userId))?.syncCursor).toBeDefined();
  });

  it('Discard removes the user\'s events without uploading them, signs out, and clears the sync cursor', async () => {
    await mountSignedIn(router, userId, [...unsynced, ...synced]);
    const dialog = await openDialog();
    router.state.isFailing = false;
    fireEvent.press(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await flush();

    const unsyncedIds = new Set(idsOf(unsynced));
    expect([...router.serverFor(userId).storedIds()].filter((id) => unsyncedIds.has(id))).toEqual([]);
    expect(await readStoredLog()).toEqual([]);
    expect(sessionDeletes(router)).toHaveLength(1);
    expect((await readUserStats(userId))?.syncCursor).toBeUndefined();
    expect(latest.stats?.eventLog).toEqual([]);
    expect(queryDialog()).toBeNull();
  });

  it('Cancel closes the dialog and changes nothing', async () => {
    await mountSignedIn(router, userId, [...unsynced, ...synced]);
    const dialog = await openDialog();
    fireEvent.press(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(queryDialog()).toBeNull());
    await flush();
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(sessionDeletes(router)).toEqual([]);
    const stored = await readStoredLog();
    for (const entry of unsynced) expect(entryIn(stored, entry.eventId)).toEqual(entry);
  });

  it('with no unsynced events signs out directly, with no dialog, clears the sync cursor, and removes the user\'s events', async () => {
    router.state.isFailing = false;
    await mountSignedIn(router, userId, synced);
    fireEvent.press(screen.getByRole('button', { name: SIGN_OUT }));
    expect(queryDialog()).toBeNull();
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await flush();
    expect(queryDialog()).toBeNull();
    expect(sessionDeletes(router)).toHaveLength(1);
    expect((await readUserStats(userId))?.syncCursor).toBeUndefined();
    expect(latest.stats?.eventLog).toEqual([]);
    expect(await readStoredLog()).toEqual([]);
  });

  it('clears the cursor in the user\'s own stats and never writes the guest\'s stats over them', async () => {
    router.state.isFailing = false;
    await seedStats({ totals: { attempted: 4, correct: 1 } });
    await mountSignedIn(router, userId, synced);
    expect(latest.stats?.stats.totals.attempted).toBe(0);
    mockSecureStoreDelete.delayMs = 50;

    fireEvent.press(screen.getByRole('button', { name: SIGN_OUT }));
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await waitFor(() => expect(latest.stats?.stats.totals.attempted).toBe(4));
    await flush();

    mockSecureStoreDelete.delayMs = 0;
    const stored = await readUserStats(userId);
    expect(stored?.totals).toEqual({ attempted: 0, correct: 0 });
    expect(stored?.syncCursor).toBeUndefined();
  });
});
