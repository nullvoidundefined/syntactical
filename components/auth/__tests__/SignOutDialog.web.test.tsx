// SignOutDialog on the web (B-61, B-64): the unsynced-events dialog is a DOM
// dialog with aria-modal="true" named by its heading, focus moves into it on
// open, and Escape closes it without signing out.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';

import { AUTH_STORAGE_KEY } from '../../../constants/appConfig';
import { buildOwnedLog } from '../../../services/sync/__tests__/fakeSyncServer';
import { AuthProvider, useAuth } from '../../../state/AuthProvider';
import { StatsProvider, useQuizStats } from '../../../state/StatsProvider';
import { SyncProvider } from '../../../state/SyncProvider';
import { createApiRouter, readStoredLog, seedEventLog, type ApiRouter } from '../../../state/__tests__/syncTestSupport';
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

describe('SignOutDialog on the web', () => {
  const userId = randomUUID();
  let router: ApiRouter;

  beforeEach(async () => {
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    // The sign-in pass fails, so the events stay unsynced.
    router.state.isFailing = true;
    router.state.activeUserId = userId;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  });

  it('opens a modal dialog named by its heading, moves focus into it, and closes on Escape without signing out', async () => {
    const unsynced = buildOwnedLog(2, userId);
    await seedEventLog(unsynced);
    render(<App />);
    await waitFor(() => {
      expect(latest.auth?.user).toEqual({ id: userId });
      expect(latest.stats?.eventLog).toHaveLength(2);
    });
    await waitFor(() => expect(router.serverFor(userId).requests.length).toBeGreaterThan(0));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const heading = within(dialog).getByRole('heading');
    expect(heading.textContent?.trim()).not.toBe('');
    expect(screen.getByRole('dialog', { name: heading.textContent?.trim() })).toBe(dialog);
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape', code: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(latest.auth?.isSignedIn).toBe(true);
    expect(router.sent.filter(({ method }) => method === 'DELETE')).toEqual([]);
    expect(await readStoredLog()).toEqual(unsynced);
  });
});
