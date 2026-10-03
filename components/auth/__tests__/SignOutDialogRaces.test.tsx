// SignOutDialog races (Task 3.11 hardening; B-61, B-64): Sync now pressed
// while an earlier pass is in flight uploads an answer recorded after that
// pass began before the session DELETE is sent; Discard pressed during an
// in-flight upload stops that pass before signing out; while Sync now runs the
// native back request leaves the dialog open, and a failure is announced
// inside it; and held events count as unsynced for the sign-out prompt.
// Real AuthProvider, StatsProvider, SyncProvider, and runSyncPass; apiFetch
// routed to a fake server per signed-in account.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AUTH_STORAGE_KEY } from '../../../constants/appConfig';
import type { LoggedAnswerEvent } from '../../../services/stats/types/LoggedAnswerEvent';
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
  type ApiRouter,
  type Hold,
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
jest.mock('../../../clients/getLatestRequestSeq', () => ({ getLatestRequestSeq: () => 0 }));
jest.mock('../../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));

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

const correctAnswer = { choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true } as const;

function isUpload(path: string, method: string): boolean {
  return method === 'POST' && path === 'answer-events';
}

function isSessionDelete(path: string, method: string): boolean {
  return method === 'DELETE' && path === 'auth/sessions/current';
}

function sessionDeletes(router: ApiRouter) {
  return router.sent.filter(({ method, path }) => isSessionDelete(path, method));
}

// Mounts signed in as userId with the given log, without waiting for the
// sign-in pass to finish.
async function mountSignedIn(router: ApiRouter, userId: string, log: LoggedAnswerEvent[]): Promise<void> {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  router.state.activeUserId = userId;
  await seedEventLog(log);
  await render(<App />);
  await waitFor(() => {
    expect(latest.auth?.user).toEqual({ id: userId });
    expect(latest.stats?.isHydrated).toBe(true);
  });
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

// The native back request (Android back, iOS dismiss) reaches the dialog
// through its Modal's onRequestClose.
async function requestNativeClose(): Promise<void> {
  const modals = screen.container.queryAll((node) => typeof node.props.onRequestClose === 'function');
  expect(modals.length).toBeGreaterThan(0);
  await act(async () => {
    (modals[0].props.onRequestClose as () => void)();
  });
}

async function openDialog(): Promise<Node> {
  await fireEvent.press(screen.getByRole('button', { name: SIGN_OUT }));
  await waitFor(() => expect(queryDialog()).not.toBeNull());
  return queryDialog() as Node;
}

describe('SignOutDialog races', () => {
  const userId = randomUUID();
  let router: ApiRouter;
  let holds: Hold[];

  // Every held request is released when a test ends, failed or not, so no
  // sign-out or pass from one test is left waiting into the next.
  function hold(predicate: (path: string, method: string) => boolean): Hold {
    const created = router.holdNext(predicate);
    holds.push(created);
    return created;
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    holds = [];
    latest.auth = null;
    latest.stats = null;
  });

  afterEach(async () => {
    holds.forEach((created) => created.release());
    await flush(200);
  });

  it('Sync now pressed while the sign-in pass is in flight uploads an answer recorded after that pass began before the session DELETE is sent', async () => {
    const unsynced = buildOwnedLog(3, userId);
    const uploadHold = hold(isUpload);
    await mountSignedIn(router, userId, unsynced);
    await waitFor(() => expect(uploadHold.isReached()).toBe(true));

    await act(async () => {
      latest.stats?.recordAnswer(correctAnswer);
    });
    const known = new Set(idsOf(unsynced));
    const lateId = idsOf(latest.stats?.eventLog ?? []).find((id) => !known.has(id));
    if (lateId === undefined) throw new Error('recordAnswer appended no event');

    const dialog = await openDialog();
    await fireEvent.press(within(dialog).getByRole('button', { name: 'Sync now' }));
    uploadHold.release();
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await flush();

    const server = router.serverFor(userId);
    expect(server.storedIds().has(lateId)).toBe(true);
    expect([...server.storedIds()].sort()).toEqual([...idsOf(unsynced), lateId].sort());
    const lastUpload = router.sent.map(({ method, path }) => isUpload(path, method)).lastIndexOf(true);
    const signOutAt = router.sent.findIndex(({ method, path }) => isSessionDelete(path, method));
    expect(signOutAt).toBeGreaterThan(lastUpload);
    expect(sessionDeletes(router)).toHaveLength(1);
  });

  it('Discard pressed during an in-flight upload sends no further batch of the discarded events, then signs out', async () => {
    const unsynced = buildOwnedLog(450, userId);
    const uploadHold = hold(isUpload);
    await mountSignedIn(router, userId, unsynced);
    await waitFor(() => expect(uploadHold.isReached()).toBe(true));

    const dialog = await openDialog();
    const deleteHold = hold(isSessionDelete);
    const sentAtDiscard = router.sent.length;
    await fireEvent.press(within(dialog).getByRole('button', { name: 'Discard' }));
    await flush();
    // The held batch completes; while the session DELETE is still held the
    // user is signed in, so any later batch would reach the server.
    uploadHold.release();
    await flush(200);
    deleteHold.release();
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await flush(200);

    const uploadsAfterDiscard = router.sent.slice(sentAtDiscard).filter(({ method, path }) => isUpload(path, method));
    expect(uploadsAfterDiscard).toEqual([]);
    expect(router.serverFor(userId).storedIds().size).toBeLessThanOrEqual(200);
    expect(sessionDeletes(router)).toHaveLength(1);
    const discardedIds = new Set(idsOf(unsynced));
    expect((await readStoredLog()).filter(({ eventId }) => discardedIds.has(eventId))).toEqual([]);
    expect(latest.stats?.eventLog).toEqual([]);
  });

  it('while Sync now is running the native back request leaves the dialog open, and a failed sync is announced in the still-open dialog', async () => {
    // The sign-in pass fails, so the events are still unsynced.
    router.state.isFailing = true;
    await mountSignedIn(router, userId, buildOwnedLog(3, userId));
    await waitFor(() => expect(router.serverFor(userId).requests.length).toBeGreaterThan(0));
    await flush();

    const dialog = await openDialog();
    const uploadHold = hold(isUpload);
    await fireEvent.press(within(dialog).getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(uploadHold.isReached()).toBe(true));

    await requestNativeClose();
    expect(queryDialog()).not.toBeNull();

    uploadHold.release();
    await screen.findByRole('alert');
    const openDialogNode = queryDialog();
    expect(openDialogNode).not.toBeNull();
    expect(within(openDialogNode as Node).getByRole('alert')).toBeTruthy();
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(sessionDeletes(router)).toEqual([]);
  });

  it('a user whose only unsynced events are held sees the dialog, and Discard removes them and signs out', async () => {
    const held = buildOwnedLog(2, userId).map((entry) => ({ ...entry, isHeld: true }));
    const synced = buildOwnedLog(2, userId, 10).map((entry) => ({ ...entry, isSynced: true }));
    await mountSignedIn(router, userId, [...held, ...synced]);
    await waitFor(() => expect(router.serverFor(userId).requests.length).toBeGreaterThan(0));
    await flush();

    await fireEvent.press(screen.getByRole('button', { name: SIGN_OUT }));
    await flush();
    const dialog = queryDialog();
    expect(dialog).not.toBeNull();
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(sessionDeletes(router)).toEqual([]);

    await fireEvent.press(within(dialog as Node).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await flush();
    const heldIds = new Set(idsOf(held));
    const stored = await readStoredLog();
    expect(stored.filter(({ eventId }) => heldIds.has(eventId))).toEqual([]);
    expect(idsOf(stored).sort()).toEqual(idsOf(synced).sort());
    expect(sessionDeletes(router)).toHaveLength(1);
  });
});
