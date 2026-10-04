// SignOutDialog keyboard on the web (Task 3.11 hardening; B-61, B-64; plan
// Global Constraints on keyboard support): while the dialog is open the quiz
// key bindings from useKeyboardNav do not fire, and they work again once it
// closes; closing it with Cancel or Escape returns focus to the "Sign out"
// control; and while Sync now runs Escape leaves the dialog open, with a
// failure announced inside it.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import { AUTH_STORAGE_KEY } from '../../../constants/appConfig';
import { buildOwnedLog } from '../../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../../../state/AuthProvider';
import { StatsProvider, useQuizStats } from '../../../state/StatsProvider';
import { SyncProvider } from '../../../state/SyncProvider';
import { useKeyboardNav } from '../../../state/useKeyboardNav';
import { createApiRouter, seedEventLog, type ApiRouter, type Hold } from '../../../state/__tests__/syncTestSupport';
import { SignOutDialog } from '../SignOutDialog';

const mockApi: { router: ApiRouter | null } = { router: null };

jest.mock('../../../clients/apiClient', () => ({
  apiFetch: (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    if (!mockApi.router) throw new Error('no router installed');
    return mockApi.router.request(path, init);
  },
}));
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
          <SignOutDialog />
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

function signOutControl(): HTMLElement {
  return screen.getByRole('button', { name: 'Sign out' });
}

async function pressKey(key: string): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document.body, { key, code: key });
  });
}

function isUpload(path: string, method: string): boolean {
  return method === 'POST' && path === 'answer-events';
}

// Mounts signed in with unsynced events; the sign-in pass fails, so they stay
// unsynced and Sign out opens the dialog.
async function mountWithUnsynced(router: ApiRouter, userId: string): Promise<void> {
  router.state.isFailing = true;
  router.state.activeUserId = userId;
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  await seedEventLog(buildOwnedLog(2, userId));
  render(<App />);
  await waitFor(() => {
    expect(latest.auth?.user).toEqual({ id: userId });
    expect(latest.stats?.eventLog).toHaveLength(2);
  });
  await waitFor(() => expect(router.serverFor(userId).requests.length).toBeGreaterThan(0));
}

// Focuses the Sign out control, then activates it, as a keyboard user would.
async function openDialogFromFocusedControl(): Promise<HTMLElement> {
  const control = signOutControl();
  await act(async () => {
    control.focus();
  });
  expect(document.activeElement).toBe(control);
  await act(async () => {
    fireEvent.click(control);
  });
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  return dialog;
}

describe('SignOutDialog keyboard on the web', () => {
  const userId = randomUUID();
  let router: ApiRouter;
  let holds: Hold[];

  // Every held request is released when a test ends, failed or not.
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
    await act(async () => {
      for (let round = 0; round < 20; round += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  });

  it('quiz key bindings do not fire while the dialog is open (1, T, Enter, Escape) and fire again once it closes', async () => {
    await mountWithUnsynced(router, userId);
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
    expect(latest.auth?.isSignedIn).toBe(true);
  });

  it('Cancel closes the dialog and returns focus to the Sign out control', async () => {
    await mountWithUnsynced(router, userId);
    const dialog = await openDialogFromFocusedControl();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(signOutControl()));
    expect(latest.auth?.isSignedIn).toBe(true);
  });

  it('Escape closes the dialog and returns focus to the Sign out control', async () => {
    await mountWithUnsynced(router, userId);
    const dialog = await openDialogFromFocusedControl();

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape', code: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(signOutControl()));
    expect(latest.auth?.isSignedIn).toBe(true);
  });

  it('keeps Tab inside the dialog: from the last control it returns to the first, and Shift+Tab from the first goes to the last', async () => {
    await mountWithUnsynced(router, userId);
    const dialog = await openDialogFromFocusedControl();
    const first = within(dialog).getByRole('button', { name: 'Sync now' });
    const last = within(dialog).getByRole('button', { name: 'Cancel' });

    await act(async () => {
      last.focus();
      fireEvent.keyDown(last, { code: 'Tab', key: 'Tab' });
    });
    expect(document.activeElement).toBe(first);

    await act(async () => {
      fireEvent.keyDown(first, { code: 'Tab', key: 'Tab', shiftKey: true });
    });
    expect(document.activeElement).toBe(last);
  });

  it('while Sync now is running Escape leaves the dialog open, and a failed sync is announced in the still-open dialog', async () => {
    await mountWithUnsynced(router, userId);
    const dialog = await openDialogFromFocusedControl();
    const uploadHold = hold(isUpload);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Sync now' }));
    });
    await waitFor(() => expect(uploadHold.isReached()).toBe(true));

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape', code: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeNull();

    uploadHold.release();
    const alert = await screen.findByRole('alert');
    const stillOpen = screen.getByRole('dialog');
    expect(stillOpen.contains(alert)).toBe(true);
    expect(alert.textContent?.trim()).not.toBe('');
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(router.sent.filter(({ method }) => method === 'DELETE')).toEqual([]);
  });
});
