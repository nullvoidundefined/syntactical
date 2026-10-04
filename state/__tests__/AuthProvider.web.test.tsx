// AuthProvider on web: the HttpOnly cookie carries the session, so verifyCode
// signs in from the returned userId alone, nothing reaches expo-secure-store,
// requests go with credentials: 'include', and AsyncStorage holds only the
// non-secret identity.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react';

import { AuthProvider, useAuth } from '../AuthProvider';
import {
  buildIdentity,
  installRoutedFetch,
  readAllStoredValues,
  readStoredAuth,
} from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

type SecureStoreMock = { getItemAsync: jest.Mock; setItemAsync: jest.Mock; deleteItemAsync: jest.Mock };

const secureStore = jest.requireMock('expo-secure-store') as SecureStoreMock;

function secureStoreCallCount(): number {
  return (
    secureStore.getItemAsync.mock.calls.length +
    secureStore.setItemAsync.mock.calls.length +
    secureStore.deleteItemAsync.mock.calls.length
  );
}

async function mountAuth() {
  const rendered = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

describe('AuthProvider on web', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('signs in from the returned userId with the cookie, storing no session value and never touching expo-secure-store', async () => {
    const identity = buildIdentity();
    const { requests } = installRoutedFetch({
      'POST auth/sessions': { status: 201, body: { data: { userId: identity.userId } } },
    });
    const { result } = await mountAuth();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.verifyCode(identity.email, identity.code);
    });

    expect(outcome).toEqual({ isOk: true });
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.user).toEqual({ id: identity.userId });
    expect(result.current.guestClaimUserId).toBe(identity.userId);
    const posted = requests.filter((request) => request.path === 'auth/sessions');
    expect(posted).toHaveLength(1);
    expect(posted[0].credentials).toBe('include');
    expect(posted[0].headers).not.toHaveProperty('authorization');
    expect(secureStoreCallCount()).toBe(0);
    await waitFor(async () => expect((await readStoredAuth())?.userId).toBe(identity.userId));
    const storedValues = (await readAllStoredValues()).join('\n');
    expect(storedValues).not.toContain(identity.email);
    expect(storedValues).not.toContain(identity.code);
  });

  it('signs out through DELETE auth/sessions/current without touching expo-secure-store', async () => {
    const identity = buildIdentity();
    const { requests } = installRoutedFetch({
      'POST auth/sessions': { status: 201, body: { data: { userId: identity.userId } } },
      'DELETE auth/sessions/current': { status: 204 },
    });
    const { result } = await mountAuth();
    await act(async () => {
      await result.current.verifyCode(identity.email, identity.code);
    });

    await act(async () => {
      await result.current.signOut();
    });

    const deletes = requests.filter((request) => request.method === 'DELETE' && request.path === 'auth/sessions/current');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].credentials).toBe('include');
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect((await readStoredAuth())?.userId ?? null).toBeNull();
    expect(secureStoreCallCount()).toBe(0);
  });
});
