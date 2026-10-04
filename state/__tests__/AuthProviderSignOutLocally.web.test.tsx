// B-59 (client half), slice B-59a2, on the web: once the server has deleted
// the account, useAuth's signOutLocally signs the browser out with no network
// request: the in-memory user is cleared, the persisted identity holds userId
// null, and a remount stays signed out.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react';

import { AuthProvider, useAuth } from '../AuthProvider';
import { buildIdentity, installRoutedFetch, readStoredAuth } from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

async function mountAuth() {
  const rendered = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

describe('AuthProvider signOutLocally on web', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('signs the browser out with no network request and stays signed out after a remount', async () => {
    const identity = buildIdentity();
    const { requests } = installRoutedFetch({
      'POST auth/sessions': { status: 201, body: { data: { userId: identity.userId } } },
      'DELETE auth/sessions/current': { status: 204 },
    });
    const first = await mountAuth();
    await act(async () => {
      await first.result.current.verifyCode(identity.email, identity.code);
    });
    expect(first.result.current.user).toEqual({ id: identity.userId });
    await waitFor(async () => expect((await readStoredAuth())?.userId).toBe(identity.userId));
    const requestsBeforeSignOut = requests.length;

    await act(async () => {
      await first.result.current.signOutLocally();
    });

    expect(requests.slice(requestsBeforeSignOut)).toEqual([]);
    expect(first.result.current.isSignedIn).toBe(false);
    expect(first.result.current.user).toBeNull();
    await waitFor(async () => expect(await readStoredAuth()).toMatchObject({ userId: null }));
    first.unmount();

    const second = await mountAuth();
    expect(second.result.current.isSignedIn).toBe(false);
    expect(second.result.current.user).toBeNull();
    expect(requests.slice(requestsBeforeSignOut)).toEqual([]);
  });
});
