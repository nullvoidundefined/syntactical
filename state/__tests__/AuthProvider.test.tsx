// AuthProvider on native: requesting and verifying a sign-in code, the
// session value held only in expo-secure-store and sent as Bearer, the
// non-secret identity persisted in AsyncStorage and restored on remount, the
// first-sign-in guest claim, sign-out that always clears local state, and a
// 401 from any API call signing the user out locally. The real apiFetch runs
// against a routed fetch stand-in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiFetch } from '../../clients/apiClient';
import { AuthProvider, useAuth } from '../AuthProvider';
import {
  AUTH_STORAGE_KEY,
  SESSION_TOKEN_KEY,
  buildIdentity,
  captureConsole,
  installRoutedFetch,
  pinDeviceTimeZone,
  readAllStoredValues,
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

type AuthValue = ReturnType<typeof useAuth>;

async function mountAuth() {
  const rendered = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

function signInRoutes(identity: SignInIdentity) {
  return {
    'POST auth/sessions': { status: 201, body: { data: { token: identity.sessionValue, userId: identity.userId } } },
    'DELETE auth/sessions/current': { status: 204 },
    'GET answer-events': { status: 200, body: { data: { events: [], nextCursor: null } } },
  };
}

async function signIn(result: { current: AuthValue }, identity: SignInIdentity) {
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.verifyCode(identity.email, identity.code);
  });
  return outcome;
}

describe('AuthProvider on native', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    secureStore.mockValues.clear();
  });

  describe('requestCode', () => {
    it('posts the email to auth/codes and reports success on 202', async () => {
      const identity = buildIdentity();
      const { requests } = installRoutedFetch({ 'POST auth/codes': { status: 202, body: { data: { status: 'code-sent' } } } });
      const { result } = await mountAuth();

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.requestCode(identity.email);
      });

      expect(outcome).toEqual({ isOk: true });
      const posted = requests.filter((request) => request.path === 'auth/codes');
      expect(posted).toHaveLength(1);
      expect(posted[0].method).toBe('POST');
      expect(posted[0].body).toEqual({ email: identity.email });
      expect(result.current.isSignedIn).toBe(false);
    });

    it.each([
      [400, 'invalid-email'],
      [429, 'rate-limited'],
      [503, 'unavailable'],
    ])('reports a %s response as %s', async (status, reason) => {
      const identity = buildIdentity();
      installRoutedFetch({
        'POST auth/codes': { status, body: { error: { code: 'X', message: 'refused', requestId: 'r1' } } },
      });
      const { result } = await mountAuth();

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.requestCode(identity.email);
      });

      expect(outcome).toEqual({ isOk: false, reason });
    });

    it('reports a network failure (ApiUnavailable) as unavailable instead of throwing', async () => {
      const identity = buildIdentity();
      installRoutedFetch({ 'POST auth/codes': 'reject' });
      const { result } = await mountAuth();

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.requestCode(identity.email);
      });

      expect(outcome).toEqual({ isOk: false, reason: 'unavailable' });
    });
  });

  describe('verifyCode', () => {
    it('posts email, code, and the device IANA time zone to auth/sessions', async () => {
      const identity = buildIdentity();
      const { requests } = installRoutedFetch(signInRoutes(identity));
      const restoreTimeZone = pinDeviceTimeZone('Pacific/Chatham');
      try {
        const { result } = await mountAuth();
        await signIn(result, identity);
      } finally {
        restoreTimeZone();
      }

      const posted = requests.filter((request) => request.path === 'auth/sessions');
      expect(posted).toHaveLength(1);
      expect(posted[0].method).toBe('POST');
      expect(posted[0].body).toEqual({ email: identity.email, code: identity.code, timezone: 'Pacific/Chatham' });
    });

    it('signs in with the returned userId on 201 and stores the session value in expo-secure-store', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const { result } = await mountAuth();

      const outcome = await signIn(result, identity);

      expect(outcome).toEqual({ isOk: true });
      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.user).toEqual({ id: identity.userId });
      expect(secureStore.mockValues.get(SESSION_TOKEN_KEY)).toBe(identity.sessionValue);
    });

    it('sends the stored session value as Bearer on later API requests', async () => {
      const identity = buildIdentity();
      const { requests } = installRoutedFetch(signInRoutes(identity));
      const { result } = await mountAuth();
      await signIn(result, identity);

      await act(async () => {
        await apiFetch('answer-events');
      });

      const later = requests.filter((request) => request.path === 'answer-events');
      expect(later).toHaveLength(1);
      expect(later[0].headers.authorization).toBe(`Bearer ${identity.sessionValue}`);
    });

    it('stays signed out and stores nothing on 400 invalid code', async () => {
      const identity = buildIdentity();
      installRoutedFetch({
        'POST auth/sessions': {
          status: 400,
          body: { error: { code: 'AUTH_INVALID_CODE', message: 'invalid code', requestId: 'r1' } },
        },
      });
      const { result } = await mountAuth();

      const outcome = await signIn(result, identity);

      expect(outcome).toEqual({ isOk: false, reason: 'invalid-code' });
      expect(result.current.isSignedIn).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.guestClaimUserId).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      const stored = await readStoredAuth();
      expect(stored?.userId ?? null).toBeNull();
    });
  });

  describe('persisted identity', () => {
    it('persists the userId, and the id as known once its guest claim completes, in syntactical.auth.v1 and restores them on the next mount', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const first = await mountAuth();
      await signIn(first.result, identity);
      await waitFor(async () => expect((await readStoredAuth())?.userId).toBe(identity.userId));
      expect(await readStoredAuth()).toEqual({ userId: identity.userId, knownUserIds: [] });
      await act(async () => {
        first.result.current.completeGuestClaim(identity.userId);
      });
      await waitFor(async () => expect(await readStoredAuth()).toEqual({ userId: identity.userId, knownUserIds: [identity.userId] }));
      await first.unmount();

      const second = await mountAuth();

      expect(second.result.current.isSignedIn).toBe(true);
      expect(second.result.current.user).toEqual({ id: identity.userId });
    });

    it('never puts the session value, email, or code in AsyncStorage, any console call, or anywhere but expo-secure-store', async () => {
      const identity = buildIdentity();
      const consoleCapture = captureConsole();
      try {
        installRoutedFetch({
          ...signInRoutes(identity),
          'POST auth/codes': { status: 202, body: { data: { status: 'code-sent' } } },
        });
        const { result } = await mountAuth();
        await act(async () => {
          await result.current.requestCode(identity.email);
        });
        await signIn(result, identity);
        await act(async () => {
          await apiFetch('answer-events');
        });
        await act(async () => {
          await result.current.signOut();
        });

        const storedValues = (await readAllStoredValues()).join('\n');
        const logged = consoleCapture.serialised();
        for (const secret of [identity.sessionValue, identity.email, identity.code]) {
          expect(storedValues).not.toContain(secret);
          expect(logged).not.toContain(secret);
        }
        const secureWrites = secureStore.setItemAsync.mock.calls as Array<[string, string]>;
        expect(secureWrites).toEqual([[SESSION_TOKEN_KEY, identity.sessionValue]]);
        expect(JSON.stringify(secureWrites)).not.toContain(identity.email);
      } finally {
        consoleCapture.restore();
      }
    });
  });

  describe('guest claim', () => {
    it('sets guestClaimUserId on the first sign-in of a user id until completeGuestClaim(id)', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const { result } = await mountAuth();
      expect(result.current.guestClaimUserId).toBeNull();

      await signIn(result, identity);
      expect(result.current.guestClaimUserId).toBe(identity.userId);

      await act(async () => {
        result.current.completeGuestClaim(identity.userId);
      });
      expect(result.current.guestClaimUserId).toBeNull();
      expect(result.current.isSignedIn).toBe(true);
    });

    it('does not set guestClaimUserId when a known user id signs in again', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const { result } = await mountAuth();
      await signIn(result, identity);
      await act(async () => {
        result.current.completeGuestClaim(identity.userId);
      });
      await act(async () => {
        await result.current.signOut();
      });

      await signIn(result, identity);

      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.guestClaimUserId).toBeNull();
    });

    it('remembers known user ids across mounts', async () => {
      const identity = buildIdentity();
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ userId: null, knownUserIds: [identity.userId] }));
      installRoutedFetch(signInRoutes(identity));
      const { result } = await mountAuth();

      await signIn(result, identity);

      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.guestClaimUserId).toBeNull();
    });
  });

  describe('signOut', () => {
    it('sends DELETE auth/sessions/current with the Bearer value, then clears the session value and the stored user', async () => {
      const identity = buildIdentity();
      const { requests } = installRoutedFetch(signInRoutes(identity));
      const first = await mountAuth();
      await signIn(first.result, identity);

      await act(async () => {
        await first.result.current.signOut();
      });

      const deletes = requests.filter((request) => request.path === 'auth/sessions/current');
      expect(deletes).toHaveLength(1);
      expect(deletes[0].method).toBe('DELETE');
      expect(deletes[0].headers.authorization).toBe(`Bearer ${identity.sessionValue}`);
      expect(first.result.current.isSignedIn).toBe(false);
      expect(first.result.current.user).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      expect((await readStoredAuth())?.userId ?? null).toBeNull();
      await first.unmount();

      const second = await mountAuth();
      expect(second.result.current.isSignedIn).toBe(false);
    });

    it.each([
      ['a 500 response', { status: 500, body: { error: { code: 'INTERNAL', message: 'boom', requestId: 'r1' } } }],
      ['a 503 response', { status: 503 }],
      ['a rejected request', 'reject'],
    ] as const)('still clears the session value and the stored user after %s', async (_label, reply) => {
      const identity = buildIdentity();
      const { requests } = installRoutedFetch({ ...signInRoutes(identity), 'DELETE auth/sessions/current': reply });
      const first = await mountAuth();
      await signIn(first.result, identity);

      await act(async () => {
        await first.result.current.signOut().catch(() => undefined);
      });

      expect(requests.some((request) => request.method === 'DELETE' && request.path === 'auth/sessions/current')).toBe(true);
      expect(first.result.current.isSignedIn).toBe(false);
      expect(first.result.current.user).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      expect((await readStoredAuth())?.userId ?? null).toBeNull();
      await first.unmount();

      const second = await mountAuth();
      expect(second.result.current.isSignedIn).toBe(false);
    });

    it('resolves rather than rejecting when the sign-out request fails', async () => {
      const identity = buildIdentity();
      installRoutedFetch({ ...signInRoutes(identity), 'DELETE auth/sessions/current': 'reject' });
      const { result } = await mountAuth();
      await signIn(result, identity);

      let rejection: unknown = null;
      await act(async () => {
        await result.current.signOut().catch((error: unknown) => {
          rejection = error;
        });
      });

      expect(rejection).toBeNull();
      expect(result.current.isSignedIn).toBe(false);
    });
  });

  describe('401 from any API call', () => {
    it('clears the session value and signs the user out locally', async () => {
      const identity = buildIdentity();
      installRoutedFetch({
        ...signInRoutes(identity),
        'GET answer-events': {
          status: 401,
          body: { error: { code: 'AUTH_SESSION_REQUIRED', message: 'session required', requestId: 'r1' } },
        },
      });
      const first = await mountAuth();
      await signIn(first.result, identity);
      expect(first.result.current.isSignedIn).toBe(true);

      await act(async () => {
        await apiFetch('answer-events');
      });

      await waitFor(() => expect(first.result.current.isSignedIn).toBe(false));
      expect(first.result.current.user).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      await waitFor(async () => expect((await readStoredAuth())?.userId ?? null).toBeNull());
      await first.unmount();

      const second = await mountAuth();
      expect(second.result.current.isSignedIn).toBe(false);
    });
  });
});
