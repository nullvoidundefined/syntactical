// DeleteAccountDialog on the web (B-59 client half, plan Task 3.21; B-64): the
// dialog is a named modal dialog; while it is open the quiz key bindings from
// useKeyboardNav do not fire, and they work again once it closes; Cancel and
// Escape close it without a request and return focus to the "Delete account"
// control; and while DELETE me is in flight Escape leaves it open.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import { AUTH_STORAGE_KEY, buildUserStatsKey } from '../../../constants/appConfig';
import { readLocalToday } from '../../../services/progress/readLocalToday';
import { createEmptyStats } from '../../../services/stats/createEmptyStats';
import { buildOwnedLog } from '../../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../../../state/AuthProvider';
import { StatsProvider, useQuizStats } from '../../../state/StatsProvider';
import { SyncProvider } from '../../../state/SyncProvider';
import { useKeyboardNav } from '../../../state/useKeyboardNav';
import { createApiRouter, idsOf, readStoredLog, seedEventLog, type ApiRouter } from '../../../state/__tests__/syncTestSupport';
import { DeleteAccountDialog } from '../DeleteAccountDialog';

// DELETE me answers 204 at once unless a gate is installed, in which case it
// waits for the gate.
const mockApi: { router: ApiRouter | null; accountGate: Promise<void> | null } = { router: null, accountGate: null };

jest.mock('../../../clients/apiClient', () => ({
  apiFetch: async (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    const router = mockApi.router;
    if (!router) throw new Error('no router installed');
    if (path !== 'me' || init?.method !== 'DELETE') return router.request(path, init);
    router.sent.push({ method: 'DELETE', path, sessionUserId: router.state.activeUserId });
    if (mockApi.accountGate) await mockApi.accountGate;
    router.state.activeUserId = null;
    return { status: 204, body: null };
  },
}));
jest.mock('../../../clients/getLatestRequestSeq', () => ({ getLatestRequestSeq: () => 0 }));
jest.mock('../../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));

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

// A quiz screen's key bindings; every action it receives is shown in order.
function QuizKeys() {
  const [actions, setActions] = useState<string[]>([]);
  function note(action: string) {
    setActions((current) => [...current, action]);
  }
  useKeyboardNav({
    onAdvance: () => note('advance'),
    onEscape: () => note('escape'),
    onSelectBool: (value) => note(`bool:${value}`),
    onSelectChoice: (index) => note(`choice:${index}`),
    onToggleQuery: () => note('query'),
  });
  return <Text testID="quiz-actions">{actions.join(',')}</Text>;
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
          <QuizKeys />
          <Probe />
        </SyncProvider>
      </OwnedStats>
    </AuthProvider>
  );
}

function quizActions(): string {
  return screen.getByTestId('quiz-actions').textContent ?? '';
}

function deleteAccountControl(): HTMLElement {
  return screen.getByRole('button', { name: 'Delete account' });
}

function accountDeletes(router: ApiRouter) {
  return router.sent.filter(({ method, path }) => method === 'DELETE' && path === 'me');
}

async function pressKey(key: string): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document.body, { key, code: key });
  });
}

async function mountSignedIn(router: ApiRouter, userId: string): Promise<string[]> {
  const log = buildOwnedLog(2, userId).map((entry) => ({ ...entry, isSynced: true }));
  router.state.activeUserId = userId;
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  await AsyncStorage.setItem(buildUserStatsKey(userId), JSON.stringify(createEmptyStats(readLocalToday())));
  await seedEventLog(log);
  render(<App />);
  await waitFor(() => {
    expect(latest.auth?.user).toEqual({ id: userId });
    expect(latest.stats?.isHydrated).toBe(true);
  });
  await waitFor(() => expect(router.serverFor(userId).requests.length).toBeGreaterThan(0));
  return idsOf(log);
}

// Focuses the Delete account control, then activates it, as a keyboard user would.
async function openDialogFromFocusedControl(): Promise<HTMLElement> {
  const control = deleteAccountControl();
  await act(async () => {
    control.focus();
  });
  expect(document.activeElement).toBe(control);
  await act(async () => {
    fireEvent.click(control);
  });
  const dialog = await screen.findByRole('dialog', { name: 'Delete account' });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  return dialog;
}

async function typeDelete(dialog: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.change(within(dialog).getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
  });
}

describe('DeleteAccountDialog on the web', () => {
  const userId = randomUUID();
  let router: ApiRouter;
  let releaseAccount: () => void;

  beforeEach(async () => {
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    mockApi.accountGate = null;
    releaseAccount = () => undefined;
    latest.auth = null;
    latest.stats = null;
  });

  afterEach(async () => {
    releaseAccount();
    await act(async () => {
      for (let round = 0; round < 20; round += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  });

  it('is an aria-modal dialog with a level-2 "Delete account" heading', async () => {
    await mountSignedIn(router, userId);
    const dialog = await openDialogFromFocusedControl();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Delete account' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Delete my account' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('quiz key bindings do not fire while the dialog is open (1, T, Enter, Escape) and fire again once it closes', async () => {
    await mountSignedIn(router, userId);
    await openDialogFromFocusedControl();

    await pressKey('1');
    await pressKey('T');
    await pressKey('Enter');
    await pressKey('Escape');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(quizActions()).toBe('');

    await pressKey('2');
    await pressKey('Escape');
    expect(quizActions()).toBe('choice:1,escape');
    expect(accountDeletes(router)).toEqual([]);
    expect(latest.auth?.isSignedIn).toBe(true);
  });

  it('Cancel closes the dialog without a request and returns focus to the Delete account control', async () => {
    const ids = await mountSignedIn(router, userId);
    const dialog = await openDialogFromFocusedControl();
    await typeDelete(dialog);

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(deleteAccountControl()));
    expect(accountDeletes(router)).toEqual([]);
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(idsOf(await readStoredLog())).toEqual(ids);
    expect(await AsyncStorage.getItem(buildUserStatsKey(userId))).not.toBeNull();
  });

  it('Escape closes the dialog without a request and returns focus to the Delete account control', async () => {
    await mountSignedIn(router, userId);
    const dialog = await openDialogFromFocusedControl();
    await typeDelete(dialog);

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape', code: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(deleteAccountControl()));
    expect(accountDeletes(router)).toEqual([]);
    expect(latest.auth?.isSignedIn).toBe(true);
  });

  it('while DELETE me is in flight Escape leaves the dialog open, and the deletion then completes', async () => {
    await mountSignedIn(router, userId);
    mockApi.accountGate = new Promise<void>((resolve) => {
      releaseAccount = resolve;
    });
    const dialog = await openDialogFromFocusedControl();
    await typeDelete(dialog);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    });
    await waitFor(() => expect(accountDeletes(router)).toHaveLength(1));

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape', code: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }).getAttribute('aria-disabled')).toBe('true');
    expect(latest.auth?.isSignedIn).toBe(true);

    releaseAccount();
    await waitFor(() => expect(latest.auth?.isSignedIn).toBe(false));
    expect(accountDeletes(router)).toHaveLength(1);
    expect(router.sent.filter(({ method, path }) => method === 'DELETE' && path === 'auth/sessions/current')).toEqual([]);
  });
});
