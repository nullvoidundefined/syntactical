// B-59 (client half): once the server has deleted the account, useAuth's
// signOutLocally signs the device out without any network request: the
// in-memory user is cleared, the persisted identity holds userId null, the
// native session value is deleted from the secure store, and the local
// sign-out still happens when that secure-store delete fails.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '../AuthProvider';
import {
  AUTH_STORAGE_KEY,
  SESSION_TOKEN_KEY,
  buildIdentity,
  captureConsole,
  installRoutedFetch,
  readStoredAuth,
  type SignInIdentity,
} from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    mockValues: values,
    getItemAsync: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
  };
});

type SecureStoreMock = {
  mockValues: Map<string, string>;
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const secureStore = jest.requireMock('expo-secure-store') as SecureStoreMock;
const deleteFromMap = secureStore.deleteItemAsync.getMockImplementation();

// A device already signed in as this identity: the stored identity and the
// session value in the secure store, as a completed sign-in leaves them.
async function seedSignedInDevice(identity: SignInIdentity): Promise<void> {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }));
  secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
}

async function mountAuth() {
  const rendered = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

describe('AuthProvider signOutLocally on native', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    secureStore.mockValues.clear();
    secureStore.deleteItemAsync.mockImplementation(deleteFromMap);
  });

  afterEach(() => {
    secureStore.deleteItemAsync.mockImplementation(deleteFromMap);
  });

  it('signs the device out with no network request and survives a remount', async () => {
    const identity = buildIdentity();
    await seedSignedInDevice(identity);
    const { requests } = installRoutedFetch({ 'DELETE auth/sessions/current': { status: 204 } });
    const first = await mountAuth();
    expect(first.result.current.isSignedIn).toBe(true);
    expect(first.result.current.user).toEqual({ id: identity.userId });

    await act(async () => {
      await first.result.current.signOutLocally();
    });

    expect(requests).toEqual([]);
    expect(first.result.current.isSignedIn).toBe(false);
    expect(first.result.current.user).toBeNull();
    expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
    await waitFor(async () => expect(await readStoredAuth()).toMatchObject({ userId: null }));
    await first.unmount();

    const second = await mountAuth();
    expect(second.result.current.isSignedIn).toBe(false);
    expect(second.result.current.user).toBeNull();
    expect(requests).toEqual([]);
  });

  it('still signs out locally when the secure-store delete throws, and logs no session value', async () => {
    const identity = buildIdentity();
    await seedSignedInDevice(identity);
    const { requests } = installRoutedFetch({ 'DELETE auth/sessions/current': { status: 204 } });
    secureStore.deleteItemAsync.mockImplementation(() => Promise.reject(new Error('keychain unavailable')));
    const consoleCapture = captureConsole();
    try {
      const first = await mountAuth();
      expect(first.result.current.isSignedIn).toBe(true);

      await act(async () => {
        await first.result.current.signOutLocally().catch(() => undefined);
      });

      expect(requests).toEqual([]);
      expect(first.result.current.isSignedIn).toBe(false);
      expect(first.result.current.user).toBeNull();
      await waitFor(async () => expect(await readStoredAuth()).toMatchObject({ userId: null }));
      expect(consoleCapture.serialised()).not.toContain(identity.sessionValue);
      await first.unmount();

      const second = await mountAuth();
      expect(second.result.current.isSignedIn).toBe(false);
    } finally {
      consoleCapture.restore();
    }
  });
});
