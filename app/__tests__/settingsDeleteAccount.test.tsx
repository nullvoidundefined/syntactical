// Settings route account deletion entry (B-59 client half, plan Task 3.21):
// a signed-in user's settings screen offers "Delete account", which opens the
// deletion dialog; a guest's settings screen offers no "Delete account". Real
// AuthProvider and StatsProvider; apiFetch is routed to a fake server.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import '../../components/auth/__tests__/preloadNativeModal';
import { createQueryClient } from '../../config/queryClient';
import { AUTH_STORAGE_KEY } from '../../constants/appConfig';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
import { StatsProvider } from '../../state/StatsProvider';
import SettingsScreen from '../settings';

type ApiCall = { method: string; path: string };

const mockServer: { calls: ApiCall[] } = { calls: [] };

jest.mock('../../clients/apiClient', () => ({
  apiFetch: (path: string, init: { method?: string } = {}) => {
    const method = init.method ?? 'GET';
    mockServer.calls.push({ method, path });
    if (method === 'GET' && path === 'me') {
      return Promise.resolve({ status: 200, body: { data: { dailyGoal: 20, dayStreak: 0, entitlements: [], timezone: 'UTC', xpToday: 0 } } });
    }
    return Promise.resolve({ body: null, status: 599 });
  },
}));
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

function OwnedStats({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

async function renderSettings() {
  await render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <OwnedStats>
          <SettingsScreen />
        </OwnedStats>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function queryDialog() {
  const found = screen.container.queryAll(
    (node) => node.props.role === 'dialog' || node.props.accessibilityRole === 'dialog',
  );
  return found.length === 0 ? null : found[0];
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockServer.calls = [];
});

describe('SettingsScreen account deletion', () => {
  it('for a guest, offers Sign in and no Delete account', async () => {
    await renderSettings();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
  });

  it('when signed in, offers Delete account, which opens the deletion dialog without sending a request', async () => {
    const userId = randomUUID();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
    await renderSettings();
    const control = await screen.findByRole('button', { name: 'Delete account' });
    expect(queryDialog()).toBeNull();

    await fireEvent.press(control);
    await waitFor(() => expect(queryDialog()).not.toBeNull());
    expect(screen.getByLabelText('Type DELETE to confirm')).toBeTruthy();
    expect(mockServer.calls.filter(({ method }) => method === 'DELETE')).toEqual([]);
  });
});
