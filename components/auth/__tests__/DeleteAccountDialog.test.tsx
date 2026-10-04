// DeleteAccountDialog (B-59 client half, plan Task 3.21; B-64): a "Delete
// account" control opens a modal dialog that permanently deletes the account
// once the user types DELETE (exactly, case-sensitive) and confirms. Confirm
// sends one DELETE /v1/me through apiFetch; on 204 the running sync pass is
// cancelled, the user is signed out locally (no session DELETE), and the
// deleted user's events and stats key leave the device while guest events
// stay. Every refusal is announced in an alert inside the dialog with nothing
// deleted locally, and the confirm button is usable again. Cancel changes
// nothing; offline the confirm button stays disabled. Real AuthProvider,
// StatsProvider, SyncProvider; apiFetch routed to a fake server.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AUTH_STORAGE_KEY, buildUserStatsKey } from '../../../constants/appConfig';
import { readLocalToday } from '../../../services/progress/readLocalToday';
import { createEmptyStats } from '../../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../../services/stats/types/LoggedAnswerEvent';
import { buildOwnedLog } from '../../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../../../state/AuthProvider';
import { StatsProvider, useQuizStats } from '../../../state/StatsProvider';
import { SyncProvider } from '../../../state/SyncProvider';
import { isModalOpen } from '../../../state/modalOpenSignal';
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
import { DeleteAccountDialog } from '../DeleteAccountDialog';

// One answer to DELETE me: a response, a rejection (network failure), or a
// response the test releases later.
type AccountReply =
  | { kind: 'response'; status: number; body: unknown }
  | { kind: 'reject' }
  | { kind: 'held'; gate: Promise<void>; status: number; body: unknown };

const mockApi: { router: ApiRouter | null; accountReplies: AccountReply[] } = { router: null, accountReplies: [] };

// The device's reported connection; the netinfo stand-in reads it.
const mockNet = { isConnected: true };

jest.mock('../../../clients/apiClient', () => ({
  apiFetch: async (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    const router = mockApi.router;
    if (!router) throw new Error('no router installed');
    if (path !== 'me' || init?.method !== 'DELETE') return router.request(path, init);
    router.sent.push({ method: 'DELETE', path, sessionUserId: router.state.activeUserId });
    const reply = mockApi.accountReplies.shift() ?? { kind: 'response', status: 204, body: null };
    if (reply.kind === 'reject') {
      const { ApiUnavailable: Unavailable } = jest.requireActual('../../../clients/ApiUnavailable');
      throw new Unavailable('API request failed');
    }
    if (reply.kind === 'held') await reply.gate;
    // The server deletes the account and clears the session on 204.
    if (reply.status === 204) router.state.activeUserId = null;
    return { status: reply.status, body: reply.body };
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
  function current() {
    return { isConnected: mockNet.isConnected, isInternetReachable: mockNet.isConnected, type: mockNet.isConnected ? 'wifi' : 'none' };
  }
  const api = {
    addEventListener: (listener: (value: ReturnType<typeof current>) => void) => {
      listener(current());
      return () => undefined;
    },
    fetch: () => Promise.resolve(current()),
    useNetInfo: () => current(),
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
          <DeleteAccountDialog />
          <Probe />
        </SyncProvider>
      </OwnedStats>
    </AuthProvider>
  );
}

const OPEN_LABEL = 'Delete account';
const CONFIRM_LABEL = 'Delete my account';
const INPUT_LABEL = 'Type DELETE to confirm';
const OFFLINE_MESSAGE = 'You are offline. Connect to the internet to delete your account.';

type Node = ReturnType<typeof screen.getByRole>;

function accountDeletes(router: ApiRouter) {
  return router.sent.filter(({ method, path }) => method === 'DELETE' && path === 'me');
}

function sessionDeletes(router: ApiRouter) {
  return router.sent.filter(({ method, path }) => method === 'DELETE' && path === 'auth/sessions/current');
}

function heldReply(status: number, body: unknown): { reply: AccountReply; release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { reply: { kind: 'held', gate, status, body }, release: () => release() };
}

async function readUserStatsText(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(buildUserStatsKey(userId));
}

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
  return ((node.children ?? []) as (Node | string)[]).map(textOf).join('');
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

type Seeded = { userEvents: LoggedAnswerEvent[]; guestEvents: LoggedAnswerEvent[] };

// Mounts signed in as userId with synced events of their own, guest events,
// and a stored stats key, and waits for hydration (and, online, for the
// sign-in pass to reach the server).
async function mountSignedIn(router: ApiRouter, userId: string): Promise<Seeded> {
  const userEvents = buildOwnedLog(3, userId).map((entry) => ({ ...entry, isSynced: true }));
  const guestEvents = buildOwnedLog(2, null, 20);
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  router.state.activeUserId = userId;
  await seedEventLog([...guestEvents, ...userEvents]);
  const empty = createEmptyStats(readLocalToday());
  await AsyncStorage.setItem(
    buildUserStatsKey(userId),
    JSON.stringify({ ...empty, totals: { ...empty.totals, attempted: 3, correct: 3 }, syncCursor: router.serverFor(userId).issueCursor(0) }),
  );
  await render(<App />);
  await waitFor(() => {
    expect(latest.auth?.user).toEqual({ id: userId });
    expect(latest.stats?.isHydrated).toBe(true);
  });
  if (mockNet.isConnected) {
    await waitFor(() => expect(router.serverFor(userId).requests.length).toBeGreaterThan(0));
  }
  await flush();
  return { userEvents, guestEvents };
}

async function openDialog(): Promise<Node> {
  await fireEvent.press(screen.getByRole('button', { name: OPEN_LABEL }));
  await waitFor(() => expect(queryDialog()).not.toBeNull());
  return queryDialog() as Node;
}

async function typeConfirmation(dialog: Node, text: string): Promise<void> {
  await fireEvent.changeText(within(dialog).getByLabelText(INPUT_LABEL), text);
}

function confirmButton(): Node {
  return within(queryDialog() as Node).getByRole('button', { name: CONFIRM_LABEL });
}

async function confirmDeletion(dialog: Node): Promise<void> {
  await typeConfirmation(dialog, 'DELETE');
  await fireEvent.press(confirmButton());
}

// Nothing about the account left the device: every seeded event and the
// user's stats key are still stored.
async function expectLocalDataKept(userId: string, seeded: Seeded): Promise<void> {
  const storedIds = new Set(idsOf(await readStoredLog()));
  for (const id of idsOf([...seeded.userEvents, ...seeded.guestEvents])) expect(storedIds.has(id)).toBe(true);
  expect(await readUserStatsText(userId)).not.toBeNull();
}

describe('DeleteAccountDialog', () => {
  const userId = randomUUID();
  let router: ApiRouter;
  let releases: (() => void)[];

  beforeEach(async () => {
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    mockApi.accountReplies = [];
    mockNet.isConnected = true;
    releases = [];
    latest.auth = null;
    latest.stats = null;
  });

  afterEach(async () => {
    releases.forEach((release) => release());
    await flush(100);
  });

  it('opens a labeled modal dialog that explains the permanent deletion, with the typed confirmation input, Delete my account, and Cancel', async () => {
    await mountSignedIn(router, userId);
    expect(queryDialog()).toBeNull();
    const dialog = await openDialog();

    expect(dialog.props['aria-modal'] ?? dialog.props.accessibilityViewIsModal).toBe(true);
    const headings = within(dialog).getAllByRole('heading');
    const heading = headings.find((candidate) => textOf(candidate).trim() === 'Delete account');
    expect(heading).toBeDefined();
    expect(heading?.props['aria-level']).toBe(2);
    const labelledBy = dialog.props['aria-labelledby'] ?? dialog.props.accessibilityLabelledBy;
    const isLabelledByHeading = labelledBy !== undefined && labelledBy === heading?.props.nativeID;
    const isLabelledWithHeadingText = (dialog.props['aria-label'] ?? dialog.props.accessibilityLabel) === 'Delete account';
    expect(isLabelledByHeading || isLabelledWithHeadingText).toBe(true);

    const explanation = textOf(dialog);
    expect(explanation).toMatch(/permanently/i);
    expect(explanation).toMatch(/synced answers/i);
    expect(explanation).toMatch(/progress/i);

    expect(within(dialog).getByLabelText(INPUT_LABEL)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: CONFIRM_LABEL })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(isModalOpen()).toBe(true);
    expect(accountDeletes(router)).toEqual([]);
  });

  it('keeps Delete my account disabled and inert until the input is exactly DELETE', async () => {
    await mountSignedIn(router, userId);
    const dialog = await openDialog();

    expect(confirmButton()).toBeDisabled();
    await fireEvent.press(confirmButton());

    for (const almost of ['delete', 'Delete', 'DELETE ', ' DELETE', 'DELET']) {
      await typeConfirmation(dialog, almost);
      expect(confirmButton()).toBeDisabled();
      expect(confirmButton().props['aria-disabled'] ?? confirmButton().props.accessibilityState?.disabled).toBe(true);
      await fireEvent.press(confirmButton());
    }
    await flush();
    expect(accountDeletes(router)).toEqual([]);

    await typeConfirmation(dialog, 'DELETE');
    expect(confirmButton()).toBeEnabled();
    expect(latest.auth?.isSignedIn).toBe(true);
  });

  it('Cancel closes the dialog, sends no request, and leaves the user signed in with local data untouched', async () => {
    const seeded = await mountSignedIn(router, userId);
    const logBefore = await readStoredLog();
    const statsBefore = await readUserStatsText(userId);
    const dialog = await openDialog();
    await typeConfirmation(dialog, 'DELETE');

    await fireEvent.press(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(queryDialog()).toBeNull());
    await flush();

    expect(isModalOpen()).toBe(false);
    expect(accountDeletes(router)).toEqual([]);
    expect(sessionDeletes(router)).toEqual([]);
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(await readStoredLog()).toEqual(logBefore);
    expect(await readUserStatsText(userId)).toBe(statsBefore);
    await expectLocalDataKept(userId, seeded);
  });

  it('on 204 sends exactly one DELETE me, signs out locally without a session DELETE, and removes only that user\'s events and stats key', async () => {
    const { guestEvents, userEvents } = await mountSignedIn(router, userId);
    const dialog = await openDialog();
    await confirmDeletion(dialog);

    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await waitFor(async () => expect(await readUserStatsText(userId)).toBeNull());
    await flush();

    expect(accountDeletes(router)).toHaveLength(1);
    expect(sessionDeletes(router)).toEqual([]);
    const stored = await readStoredLog();
    expect(stored.filter(({ ownerUserId }) => ownerUserId === userId)).toEqual([]);
    const storedIds = new Set(idsOf(stored));
    for (const id of idsOf(userEvents)) expect(storedIds.has(id)).toBe(false);
    for (const id of idsOf(guestEvents)) expect(storedIds.has(id)).toBe(true);
    expect(await readUserStatsText(userId)).toBeNull();
  });

  it('on 204 stops the running sync pass, so no upload is sent after the account DELETE', async () => {
    // Many unsynced events, so the sign-in pass needs several batches; the
    // first batch is held in flight while the account is deleted.
    const unsynced = buildOwnedLog(450, userId);
    const uploadHold: Hold = router.holdNext((path, method) => method === 'POST' && path === 'answer-events');
    releases.push(uploadHold.release);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
    router.state.activeUserId = userId;
    await seedEventLog(unsynced);
    await render(<App />);
    await waitFor(() => expect(latest.stats?.isHydrated).toBe(true));
    await waitFor(() => expect(uploadHold.isReached()).toBe(true));

    const dialog = await openDialog();
    await confirmDeletion(dialog);
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    const sentAtDeletion = router.sent.findIndex(({ method, path }) => method === 'DELETE' && path === 'me');
    uploadHold.release();
    await flush(200);

    const uploadsAfter = router.sent
      .slice(sentAtDeletion + 1)
      .filter(({ method, path }) => method === 'POST' && path === 'answer-events');
    expect(uploadsAfter).toEqual([]);
    const deletedIds = new Set(idsOf(unsynced));
    await waitFor(async () => expect((await readStoredLog()).filter(({ eventId }) => deletedIds.has(eventId))).toEqual([]));
    expect(sessionDeletes(router)).toEqual([]);
  });

  it('while DELETE me is in flight the buttons are disabled and neither Cancel nor the native back request closes the dialog', async () => {
    await mountSignedIn(router, userId);
    const held = heldReply(204, null);
    releases.push(held.release);
    mockApi.accountReplies.push(held.reply);
    const dialog = await openDialog();
    await confirmDeletion(dialog);
    await waitFor(() => expect(accountDeletes(router)).toHaveLength(1));

    const open = queryDialog() as Node;
    expect(within(open).getByRole('button', { name: CONFIRM_LABEL })).toBeDisabled();
    expect(within(open).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await fireEvent.press(within(open).getByRole('button', { name: 'Cancel' }));
    await fireEvent.press(within(open).getByRole('button', { name: CONFIRM_LABEL }));
    await requestNativeClose();
    await flush();
    expect(queryDialog()).not.toBeNull();
    expect(accountDeletes(router)).toHaveLength(1);
    expect(latest.auth?.isSignedIn).toBe(true);

    held.release();
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    expect(accountDeletes(router)).toHaveLength(1);
  });

  const refusals: { name: string; reply: AccountReply; message: string }[] = [
    {
      name: '403 (CSRF refusal)',
      reply: { kind: 'response', status: 403, body: { error: { code: 'CSRF_INVALID' } } },
      message: 'Your account could not be deleted. Reload the app and try again.',
    },
    {
      name: '429 RATE_LIMIT_EXCEEDED',
      reply: { kind: 'response', status: 429, body: { error: { code: 'RATE_LIMIT_EXCEEDED' } } },
      message: 'Too many attempts. Wait a few minutes, then try again.',
    },
    {
      name: '503 SERVER_BUSY',
      reply: { kind: 'response', status: 503, body: { error: { code: 'SERVER_BUSY' } } },
      message: 'The server is busy. Try again in a moment.',
    },
    {
      name: 'a rejected request (ApiUnavailable)',
      reply: { kind: 'reject' },
      message: 'Your account could not be deleted. Check your connection and try again.',
    },
    {
      name: 'an unexpected status (500)',
      reply: { kind: 'response', status: 500, body: { error: { code: 'SERVER_INTERNAL_ERROR' } } },
      message: 'Your account could not be deleted. Check your connection and try again.',
    },
  ];

  it.each(refusals)('on $name announces the refusal in an alert inside the dialog, deletes nothing locally, stays signed in, and allows a retry', async ({ reply, message }) => {
    const seeded = await mountSignedIn(router, userId);
    mockApi.accountReplies.push(reply);
    const dialog = await openDialog();
    await confirmDeletion(dialog);

    const alert = await screen.findByRole('alert');
    expect(textOf(alert).trim()).toBe(message);
    const open = queryDialog();
    expect(open).not.toBeNull();
    expect(within(open as Node).getByRole('alert')).toBe(alert);
    await flush();
    expect(accountDeletes(router)).toHaveLength(1);
    expect(sessionDeletes(router)).toEqual([]);
    expect(latest.auth?.isSignedIn).toBe(true);
    await expectLocalDataKept(userId, seeded);

    // A retry goes through once the server accepts it.
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    await fireEvent.press(confirmButton());
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    expect(accountDeletes(router)).toHaveLength(2);
    await waitFor(async () => expect(await readUserStatsText(userId)).toBeNull());
  });

  it('on 401 announces that the session ended and deletes no local data', async () => {
    const seeded = await mountSignedIn(router, userId);
    mockApi.accountReplies.push({ kind: 'response', status: 401, body: { error: { code: 'SESSION_REQUIRED' } } });
    const dialog = await openDialog();
    await confirmDeletion(dialog);

    const alert = await screen.findByRole('alert');
    expect(textOf(alert).trim()).toBe('Your session has ended. Sign in again to delete your account.');
    await flush();
    expect(accountDeletes(router)).toHaveLength(1);
    expect(sessionDeletes(router)).toEqual([]);
    await expectLocalDataKept(userId, seeded);
  });

  it('offline, shows the offline message and keeps Delete my account disabled with DELETE typed', async () => {
    mockNet.isConnected = false;
    await mountSignedIn(router, userId);
    const dialog = await openDialog();
    await typeConfirmation(dialog, 'DELETE');

    expect(within(dialog).getByText(OFFLINE_MESSAGE)).toBeTruthy();
    expect(confirmButton()).toBeDisabled();
    await fireEvent.press(confirmButton());
    await flush();
    expect(accountDeletes(router)).toEqual([]);
    expect(latest.auth?.isSignedIn).toBe(true);
  });
});
