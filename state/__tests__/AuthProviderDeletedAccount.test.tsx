// AuthProvider after the server deletes the account: signOutDeletedAccount
// signs out with no request and forgets the deleted id, so the stored known
// user ids no longer name it while other ids stay.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '../AuthProvider';
import { AUTH_STORAGE_KEY, buildIdentity, installRoutedFetch, readStoredAuth } from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
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

describe('AuthProvider signOutDeletedAccount', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('removes the deleted id from the stored known ids, keeping other ids', async () => {
    const identity = buildIdentity();
    const otherId = buildIdentity().userId;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [otherId], userId: null }));
    installRoutedFetch({
      'POST auth/sessions': { status: 201, body: { data: { token: identity.sessionValue, userId: identity.userId } } },
      'GET answer-events': { status: 200, body: { data: { events: [], nextCursor: null } } },
    });
    const { result } = await renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await act(async () => {
      await result.current.verifyCode(identity.email, identity.code);
    });
    await act(async () => {
      result.current.completeGuestClaim(identity.userId);
    });
    await waitFor(async () => expect((await readStoredAuth())?.knownUserIds).toContain(identity.userId));

    await act(async () => {
      await result.current.signOutDeletedAccount(identity.userId);
    });

    expect(result.current.isSignedIn).toBe(false);
    await waitFor(async () => expect((await readStoredAuth())?.knownUserIds).toEqual([otherId]));
    expect((await AsyncStorage.getItem(AUTH_STORAGE_KEY)) ?? '').not.toContain(identity.userId);
  });
});
