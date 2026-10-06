// Settings accessibility on the web: the signed-in settings screen, then the same screen with the
// delete account dialog open, each have no axe violations (the rule engine Lighthouse uses).
// color-contrast is disabled because jsdom computes no layout or rendered colors, so axe cannot
// evaluate it here; contrast is covered by the Lighthouse run on the built web app.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from '../../components/layout/AppShell';
import { createQueryClient } from '../../config/queryClient';
import { AUTH_STORAGE_KEY } from '../../constants/appConfig';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
import { OwnedStatsProvider } from '../../state/OwnedStatsProvider';
import { createApiRouter, type ApiRouter } from '../../state/__tests__/syncTestSupport';
import SettingsScreen from '../settings';

expect.extend(toHaveNoViolations);

const mockApi: { router: ApiRouter | null } = { router: null };

jest.mock('../../clients/apiClient', () => ({
  apiFetch: (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    if (!mockApi.router) throw new Error('no router installed');
    return mockApi.router.request(path, init);
  },
}));
jest.mock('../../state/SyncProvider', () => ({
  useSync: () => ({ cancelPass: () => undefined, isSyncing: false, isUploadCapReached: false, syncNow: () => Promise.resolve(true) }),
}));
jest.mock('../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));
jest.mock('../../components/layout/ReviewDueLink', () => ({ ReviewDueLink: () => null }));
jest.mock('../../components/layout/DownloadIndicator', () => ({ DownloadIndicator: () => null }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@react-native-community/netinfo', () => {
  const api = {
    addEventListener: (listener: (value: { isConnected: boolean }) => void) => {
      listener({ isConnected: true });
      return () => undefined;
    },
    fetch: () => Promise.resolve({ isConnected: true }),
  };
  return { __esModule: true, default: api, ...api };
});

const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

const latest: { auth: ReturnType<typeof useAuth> | null } = { auth: null };

function Probe() {
  latest.auth = useAuth();
  return null;
}

describe('settings screen accessibility on the web', () => {
  const userId = randomUUID();

  beforeEach(async () => {
    await AsyncStorage.clear();
    const router = createApiRouter();
    router.state.activeUserId = userId;
    mockApi.router = router;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  });

  it('has no axe violations signed in, and none with the delete account dialog open', async () => {
    const { container } = render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 800, width: 400, x: 0, y: 0 }, insets: { bottom: 0, left: 0, right: 0, top: 0 } }}>
        <QueryClientProvider client={createQueryClient()}>
          <AuthProvider>
            <OwnedStatsProvider>
              <AppShell>
                <SettingsScreen />
              </AppShell>
              <Probe />
            </OwnedStatsProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(latest.auth?.user).toEqual({ id: userId }));
    const deleteControl = await screen.findByRole('button', { name: 'Delete account' });

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();

    await act(async () => {
      fireEvent.click(deleteControl);
    });
    await screen.findByRole('dialog', { name: 'Delete account' });

    expect(await axe(document.body, AXE_OPTIONS)).toHaveNoViolations();
  });
});
