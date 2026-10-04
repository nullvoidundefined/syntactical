// DeleteAccountDialog (Task 3.21 client, B-59): "Delete my account" stays disabled until the
// user types DELETE exactly; Cancel closes and sends nothing. On 204 from DELETE /v1/me the
// device signs out with no session request and that user's local events and stats key go,
// while guest events stay. Any failure shows one generic message and keeps everything; offline
// shows an offline message and the confirm stays disabled. Real AuthProvider, StatsProvider,
// and SyncProvider; apiFetch routed to a fake server.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { AUTH_STORAGE_KEY, buildUserStatsKey } from '../../../constants/appConfig';
import { readLocalToday } from '../../../services/progress/readLocalToday';
import { createEmptyStats } from '../../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../../services/stats/types/LoggedAnswerEvent';
import { buildOwnedLog } from '../../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../../../state/AuthProvider';
import { OwnedStatsProvider } from '../../../state/OwnedStatsProvider';
import { SyncProvider } from '../../../state/SyncProvider';
import { createApiRouter, flush, idsOf, readStoredLog, seedEventLog, type ApiRouter } from '../../../state/__tests__/syncTestSupport';
import './preloadNativeModal';
import { DeleteAccountDialog } from '../DeleteAccountDialog';

type Reply = { status: number; body: unknown } | 'reject';

const mockApi: { beforeDeleteReply: (() => Promise<void>) | null; deleteReply: Reply; router: ApiRouter | null } = {
  beforeDeleteReply: null,
  deleteReply: { body: null, status: 204 },
  router: null,
};
const mockNetwork = { isConnected: true };

jest.mock('../../../clients/apiClient', () => ({
  apiFetch: async (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    if (!mockApi.router) throw new Error('no router installed');
    if (path === 'me' && init?.method === 'DELETE') {
      mockApi.router.sent.push({ method: 'DELETE', path, sessionUserId: mockApi.router.state.activeUserId });
      await mockApi.beforeDeleteReply?.();
      const reply = mockApi.deleteReply;
      if (reply === 'reject') throw new Error('network down');
      return reply;
    }
    return mockApi.router.request(path, init);
  },
}));
jest.mock('../../../clients/getLatestRequestSeq', () => ({ getLatestRequestSeq: () => 0 }));
jest.mock('../../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));
jest.mock('@react-native-community/netinfo', () => {
  const api = {
    addEventListener: (listener: (value: { isConnected: boolean }) => void) => {
      listener({ isConnected: mockNetwork.isConnected });
      return () => undefined;
    },
    fetch: () => Promise.resolve({ isConnected: mockNetwork.isConnected }),
  };
  return { __esModule: true, default: api, ...api };
});

const DELETE_ACCOUNT = 'Delete account';
const CONFIRM = 'Delete my account';
const INPUT = 'Type DELETE to confirm';
const GENERIC_FAILURE = 'Your account could not be deleted. Try again.';
const OFFLINE = 'You are offline. Connect to the internet to delete your account.';

const latest: { auth: ReturnType<typeof useAuth> | null } = { auth: null };

function Probe() {
  latest.auth = useAuth();
  return null;
}

function App() {
  return (
    <AuthProvider>
      <OwnedStatsProvider>
        <SyncProvider>
          <DeleteAccountDialog />
          <Probe />
        </SyncProvider>
      </OwnedStatsProvider>
    </AuthProvider>
  );
}

type Node = ReturnType<typeof screen.getByRole>;

// A modal View with role="dialog" is not itself an accessibility element, so it is found by its role prop.
function queryDialog(): Node | null {
  const found = screen.container.queryAll((node) => node.props.role === 'dialog');
  return found.length === 0 ? null : (found[0] as Node);
}

function isDisabled(button: Node): boolean {
  return button.props['aria-disabled'] === true || button.props.accessibilityState?.disabled === true;
}

async function mountSignedIn(router: ApiRouter, userId: string, log: LoggedAnswerEvent[]): Promise<void> {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  await AsyncStorage.setItem(buildUserStatsKey(userId), JSON.stringify(createEmptyStats(readLocalToday())));
  router.state.activeUserId = userId;
  await seedEventLog(log);
  await render(<App />);
  await waitFor(() => expect(latest.auth?.user).toEqual({ id: userId }));
  await flush();
}

async function openDialog(): Promise<Node> {
  await fireEvent.press(screen.getByRole('button', { name: DELETE_ACCOUNT }));
  await waitFor(() => expect(queryDialog()).not.toBeNull());
  return queryDialog() as Node;
}

function deleteRequests(router: ApiRouter) {
  return router.sent.filter(({ method, path }) => method === 'DELETE' && path === 'me');
}

describe('DeleteAccountDialog', () => {
  const userId = randomUUID();
  let router: ApiRouter;
  let userEntries: LoggedAnswerEvent[];
  let guestEntries: LoggedAnswerEvent[];

  beforeEach(async () => {
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    mockApi.beforeDeleteReply = null;
    mockApi.deleteReply = { body: null, status: 204 };
    mockNetwork.isConnected = true;
    latest.auth = null;
    userEntries = buildOwnedLog(3, userId);
    guestEntries = buildOwnedLog(2, null, 10);
  });

  it('enables the confirm only for DELETE typed exactly, and Cancel closes without a request', async () => {
    await mountSignedIn(router, userId, [...guestEntries, ...userEntries]);
    const dialog = await openDialog();
    const confirm = within(dialog).getByRole('button', { name: CONFIRM });
    expect(isDisabled(confirm)).toBe(true);

    await fireEvent.changeText(within(dialog).getByLabelText(INPUT), 'delete');
    expect(isDisabled(within(dialog).getByRole('button', { name: CONFIRM }))).toBe(true);
    await fireEvent.press(within(dialog).getByRole('button', { name: CONFIRM }));
    await fireEvent.changeText(within(dialog).getByLabelText(INPUT), 'DELETE');
    expect(isDisabled(within(dialog).getByRole('button', { name: CONFIRM }))).toBe(false);
    await fireEvent.press(within(dialog).getByRole('button', { name: 'Cancel' }));
    await flush();

    expect(queryDialog()).toBeNull();
    expect(deleteRequests(router)).toEqual([]);
    expect(latest.auth?.user).toEqual({ id: userId });
  });

  it('on 204 signs out locally and removes that user\'s events and stats key, keeping guest events', async () => {
    await mountSignedIn(router, userId, [...guestEntries, ...userEntries]);
    const dialog = await openDialog();
    await fireEvent.changeText(within(dialog).getByLabelText(INPUT), 'DELETE');
    await fireEvent.press(within(dialog).getByRole('button', { name: CONFIRM }));
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await flush();

    expect(deleteRequests(router)).toHaveLength(1);
    expect(router.sent.filter(({ path }) => path === 'auth/sessions/current')).toEqual([]);
    expect(idsOf(await readStoredLog()).sort()).toEqual(idsOf(guestEntries).sort());
    expect(await AsyncStorage.getItem(buildUserStatsKey(userId))).toBeNull();
    expect(queryDialog()).toBeNull();
  });

  it('still removes the user\'s events and stats key when a concurrent 401 signed the device out between the 204 and the local sign-out', async () => {
    await mountSignedIn(router, userId, [...guestEntries, ...userEntries]);
    mockApi.beforeDeleteReply = async () => {
      await latest.auth?.signOut();
    };
    const dialog = await openDialog();
    await fireEvent.changeText(within(dialog).getByLabelText(INPUT), 'DELETE');
    await fireEvent.press(within(dialog).getByRole('button', { name: CONFIRM }));
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    await waitFor(async () => expect(await AsyncStorage.getItem(buildUserStatsKey(userId))).toBeNull());
    await flush();

    expect(idsOf(await readStoredLog()).sort()).toEqual(idsOf(guestEntries).sort());
    expect(await AsyncStorage.getItem(buildUserStatsKey(userId))).toBeNull();
  });

  it.each([
    ['a refusal', { body: { error: { code: 'CSRF_HEADER_MISSING' } }, status: 403 }],
    ['a server error', { body: null, status: 500 }],
    ['a failed request', 'reject'],
  ] as const)('on %s shows the generic message and keeps the account and events', async (_name, reply) => {
    mockApi.deleteReply = reply;
    await mountSignedIn(router, userId, [...guestEntries, ...userEntries]);
    const dialog = await openDialog();
    await fireEvent.changeText(within(dialog).getByLabelText(INPUT), 'DELETE');
    await fireEvent.press(within(dialog).getByRole('button', { name: CONFIRM }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent(GENERIC_FAILURE));
    await flush();

    expect(latest.auth?.user).toEqual({ id: userId });
    expect(idsOf(await readStoredLog()).sort()).toEqual(idsOf([...guestEntries, ...userEntries]).sort());
    expect(await AsyncStorage.getItem(buildUserStatsKey(userId))).not.toBeNull();
  });

  it('offline shows the offline message and keeps the confirm disabled', async () => {
    mockNetwork.isConnected = false;
    await mountSignedIn(router, userId, userEntries);
    const dialog = await openDialog();
    await fireEvent.changeText(within(dialog).getByLabelText(INPUT), 'DELETE');

    expect(within(dialog).getByRole('alert')).toHaveTextContent(OFFLINE);
    const confirm = within(dialog).getByRole('button', { name: CONFIRM });
    expect(isDisabled(confirm)).toBe(true);
    await fireEvent.press(confirm);
    await flush();
    expect(deleteRequests(router)).toEqual([]);
  });
});
