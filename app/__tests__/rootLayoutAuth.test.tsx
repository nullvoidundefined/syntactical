// The root layout with auth and sync wired in (Task 3.11; B-61, B-64): it
// mounts AuthProvider, StatsProvider owned by the signed-in user (null for a
// guest), and SyncProvider around every route, so /sign-in renders under the
// real layout with the real useAuth; the app shell offers a "Sign in" link to
// a guest and a "Sign out" control to a signed-in user, and that control sees
// the signed-in user's own unsynced events.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { AUTH_STORAGE_KEY } from '../../constants/appConfig';
import { buildOwnedLog } from '../../services/sync/__tests__/fakeSyncServer';
import { seedEventLog } from '../../state/__tests__/syncTestSupport';
import RootLayout from '../_layout';
import HomeScreen from '../index';
import SignInScreen from '../sign-in';

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

const routes = { _layout: RootLayout, index: HomeScreen, 'sign-in': SignInScreen };

function queryDialog() {
  const found = screen.container.queryAll(
    (node) => node.props.role === 'dialog' || node.props.accessibilityRole === 'dialog',
  );
  return found.length === 0 ? null : found[0];
}

describe('root layout with auth and sync', () => {
  beforeEach(() => AsyncStorage.clear());

  it('renders /sign-in under the real layout with the real useAuth', async () => {
    await renderRouter(routes, { initialUrl: '/sign-in' });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
  });

  it('shows a guest a "Sign in" link and no "Sign out" control', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('shows a signed-in user a "Sign out" control that sees that user\'s unsynced events', async () => {
    const userId = randomUUID();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
    await seedEventLog([...buildOwnedLog(2, userId), ...buildOwnedLog(2, null, 10)]);
    await renderRouter(routes, { initialUrl: '/' });
    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
    fireEvent.press(signOut);
    await waitFor(() => expect(queryDialog()).not.toBeNull());
  });
});
