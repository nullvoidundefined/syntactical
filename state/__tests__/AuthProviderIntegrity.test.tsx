// AuthProvider session integrity on native: a 401 from a request sent before
// the current sign-in never signs the new user out, a sign-in without a
// session value is refused, the guest claim is persisted per user until that
// user's claim completes, calls made before hydration act as if hydration had
// finished first, overlapping sign-in and sign-out keep the newest session,
// and a failed secure-store delete still signs out with a warning that holds
// no secret. The real apiFetch runs against a routed fetch stand-in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'node:crypto';

import { apiFetch } from '../../clients/apiClient';
import { AuthProvider, useAuth } from '../AuthProvider';
import {
  AUTH_STORAGE_KEY,
  SESSION_TOKEN_KEY,
  buildIdentity,
  captureConsole,
  holdReply,
  installRoutedFetch,
  readAllStoredValues,
  readStoredAuth,
  type FakeReply,
  type SignInIdentity,
} from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  const defaults = {
    getItemAsync: (key: string) => Promise.resolve(values.get(key) ?? null),
    setItemAsync: (key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key: string) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
  return {
    mockValues: values,
    mockDefaults: defaults,
    getItemAsync: jest.fn(defaults.getItemAsync),
    setItemAsync: jest.fn(defaults.setItemAsync),
    deleteItemAsync: jest.fn(defaults.deleteItemAsync),
  };
});

type SecureStoreMock = {
  mockValues: Map<string, string>;
  mockDefaults: {
    getItemAsync: (key: string) => Promise<string | null>;
    setItemAsync: (key: string, value: string) => Promise<void>;
    deleteItemAsync: (key: string) => Promise<void>;
  };
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const secureStore = jest.requireMock('expo-secure-store') as SecureStoreMock;

const storageGetItem = AsyncStorage.getItem as jest.Mock;
const originalGetItem = storageGetItem.getMockImplementation() as (
  key: string,
  ...rest: unknown[]
) => Promise<string | null>;

type AuthValue = ReturnType<typeof useAuth>;

const UNAUTHORIZED: FakeReply = {
  status: 401,
  body: { error: { code: 'AUTH_SESSION_REQUIRED', message: 'session required', requestId: 'r1' } },
};

function sessionReply(identity: SignInIdentity): FakeReply {
  return { status: 201, body: { data: { token: identity.sessionValue, userId: identity.userId } } };
}

function signInRoutes(identity: SignInIdentity) {
  return {
    'POST auth/sessions': sessionReply(identity),
    'DELETE auth/sessions/current': { status: 204 } as FakeReply,
  };
}

async function mountAuth() {
  const rendered = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

async function signIn(result: { current: AuthValue }, identity: SignInIdentity) {
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.verifyCode(identity.email, identity.code);
  });
  return outcome;
}

async function signOut(result: { current: AuthValue }) {
  await act(async () => {
    await result.current.signOut();
  });
}

async function completeClaim(result: { current: AuthValue }, userId: string) {
  await act(async () => {
    result.current.completeGuestClaim(userId);
  });
}

// Lets every pending promise and zero-delay timer run, so work that does not
// wait on a held reply finishes before the test moves on.
async function flush() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

// Holds the first AsyncStorage read of the identity key until release(), so
// a test can call into the provider before hydration finishes.
function holdIdentityRead(): { release(): void } {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let isHeld = false;
  storageGetItem.mockImplementation((key: string, ...rest: unknown[]) => {
    if (key === AUTH_STORAGE_KEY && !isHeld) {
      isHeld = true;
      return originalGetItem(key, ...rest).then((value) => gate.then(() => value));
    }
    return originalGetItem(key, ...rest);
  });
  return { release: () => open() };
}

function failIdentityRead(): void {
  let hasFailed = false;
  storageGetItem.mockImplementation((key: string, ...rest: unknown[]) => {
    if (key === AUTH_STORAGE_KEY && !hasFailed) {
      hasFailed = true;
      return Promise.reject(new Error('storage read failed'));
    }
    return originalGetItem(key, ...rest);
  });
}

async function storedUserId(): Promise<string | null> {
  return (await readStoredAuth())?.userId ?? null;
}

async function storedKnownIds(): Promise<string[]> {
  return (await readStoredAuth())?.knownUserIds ?? [];
}

describe('AuthProvider session integrity on native', () => {
  beforeEach(async () => {
    storageGetItem.mockImplementation(originalGetItem);
    await AsyncStorage.clear();
    secureStore.mockValues.clear();
    secureStore.getItemAsync.mockImplementation(secureStore.mockDefaults.getItemAsync);
    secureStore.setItemAsync.mockImplementation(secureStore.mockDefaults.setItemAsync);
    secureStore.deleteItemAsync.mockImplementation(secureStore.mockDefaults.deleteItemAsync);
  });

  afterEach(() => {
    storageGetItem.mockImplementation(originalGetItem);
  });

  describe('a 401 from a request sent before the current sign-in', () => {
    it('keeps a new user signed in when a guest request sent before sign-in returns 401 afterwards', async () => {
      const newUser = buildIdentity();
      const held = holdReply();
      const { requests } = installRoutedFetch({ ...signInRoutes(newUser), 'GET answer-events': held });
      const { result } = await mountAuth();

      let stale: Promise<unknown> = Promise.resolve();
      await act(async () => {
        stale = apiFetch('answer-events').catch(() => undefined);
      });
      await waitFor(() => expect(requests.some((request) => request.path === 'answer-events')).toBe(true));

      expect(await signIn(result, newUser)).toEqual({ isOk: true });
      await act(async () => {
        held.release(UNAUTHORIZED);
        await stale;
      });
      await flush();

      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.user).toEqual({ id: newUser.userId });
      expect(secureStore.mockValues.get(SESSION_TOKEN_KEY)).toBe(newUser.sessionValue);
      expect(await storedUserId()).toBe(newUser.userId);
    });

    it('keeps a new user signed in when a request sent under the previous user returns 401 after the new sign-in', async () => {
      const previousUser = buildIdentity();
      const newUser = buildIdentity();
      const held = holdReply();
      const { requests, setRoute } = installRoutedFetch({
        ...signInRoutes(previousUser),
        'GET answer-events': held,
      });
      setRoute('POST auth/sessions', [sessionReply(previousUser), sessionReply(newUser)]);
      const { result } = await mountAuth();
      await signIn(result, previousUser);

      let stale: Promise<unknown> = Promise.resolve();
      await act(async () => {
        stale = apiFetch('answer-events').catch(() => undefined);
      });
      await waitFor(() => expect(requests.some((request) => request.path === 'answer-events')).toBe(true));
      const staleRequest = requests.find((request) => request.path === 'answer-events');
      expect(staleRequest?.headers.authorization).toBe(`Bearer ${previousUser.sessionValue}`);

      await signOut(result);
      expect(await signIn(result, newUser)).toEqual({ isOk: true });
      await act(async () => {
        held.release(UNAUTHORIZED);
        await stale;
      });
      await flush();

      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.user).toEqual({ id: newUser.userId });
      expect(secureStore.mockValues.get(SESSION_TOKEN_KEY)).toBe(newUser.sessionValue);
      expect(await storedUserId()).toBe(newUser.userId);
    });

    it('still signs out when a request sent under the current session returns 401', async () => {
      const identity = buildIdentity();
      const held = holdReply();
      const { requests } = installRoutedFetch({ ...signInRoutes(identity), 'GET answer-events': held });
      const { result } = await mountAuth();
      await signIn(result, identity);

      let current: Promise<unknown> = Promise.resolve();
      await act(async () => {
        current = apiFetch('answer-events').catch(() => undefined);
      });
      await waitFor(() => expect(requests.some((request) => request.path === 'answer-events')).toBe(true));
      await act(async () => {
        held.release(UNAUTHORIZED);
        await current;
      });

      await waitFor(() => expect(result.current.isSignedIn).toBe(false));
      expect(result.current.user).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      await waitFor(async () => expect(await storedUserId()).toBeNull());
    });
  });

  describe('verifyCode outcomes', () => {
    it('reports a 201 without a session value as unavailable, stores nothing, raises no claim, and stays signed out', async () => {
      const identity = buildIdentity();
      const { setRoute } = installRoutedFetch({
        'POST auth/sessions': { status: 201, body: { data: { userId: identity.userId } } },
      });
      const { result } = await mountAuth();

      const outcome = await signIn(result, identity);
      await flush();

      expect(outcome).toEqual({ isOk: false, reason: 'unavailable' });
      expect(result.current.isSignedIn).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.guestClaimUserId).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      expect(await storedUserId()).toBeNull();
      expect(await storedKnownIds()).not.toContain(identity.userId);

      // The refused attempt did not mark the id as known: a real sign-in of
      // the same id is still its first on this device.
      setRoute('POST auth/sessions', sessionReply(identity));
      expect(await signIn(result, identity)).toEqual({ isOk: true });
      expect(result.current.guestClaimUserId).toBe(identity.userId);
    });

    it.each([
      ['a 429 response', { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'slow down', requestId: 'r1' } } }, 'rate-limited'],
      ['a 500 response', { status: 500, body: { error: { code: 'INTERNAL', message: 'boom', requestId: 'r1' } } }, 'unavailable'],
      ['a 503 response', { status: 503 }, 'unavailable'],
      ['a network rejection', 'reject', 'unavailable'],
    ] as const)('maps %s to %s and stays signed out', async (_label, reply, reason) => {
      const identity = buildIdentity();
      installRoutedFetch({ 'POST auth/sessions': reply as FakeReply });
      const { result } = await mountAuth();

      const outcome = await signIn(result, identity);

      expect(outcome).toEqual({ isOk: false, reason });
      expect(result.current.isSignedIn).toBe(false);
      expect(result.current.guestClaimUserId).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
    });

    it('maps a 201 without a userId to unavailable and stores no session value', async () => {
      const identity = buildIdentity();
      installRoutedFetch({ 'POST auth/sessions': { status: 201, body: { data: { token: identity.sessionValue } } } });
      const { result } = await mountAuth();

      const outcome = await signIn(result, identity);

      expect(outcome).toEqual({ isOk: false, reason: 'unavailable' });
      expect(result.current.isSignedIn).toBe(false);
      expect(result.current.guestClaimUserId).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      expect(await storedUserId()).toBeNull();
    });

    it('maps a secure-store write failure to unavailable with the user still signed out', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      secureStore.setItemAsync.mockImplementation(() => Promise.reject(new Error('keychain unavailable')));
      const { result } = await mountAuth();

      const outcome = await signIn(result, identity);
      await flush();

      expect(outcome).toEqual({ isOk: false, reason: 'unavailable' });
      expect(result.current.isSignedIn).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.guestClaimUserId).toBeNull();
      expect(await storedUserId()).toBeNull();
    });
  });

  describe('the pending guest claim', () => {
    it('stays raised until completeGuestClaim, and the stored values hold no secret', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const { result } = await mountAuth();
      await signIn(result, identity);
      expect(result.current.guestClaimUserId).toBe(identity.userId);
      await waitFor(async () => expect(await storedUserId()).toBe(identity.userId));
      await flush();

      const storedValues = (await readAllStoredValues()).join('\n');
      for (const secret of [identity.sessionValue, identity.email, identity.code]) {
        expect(storedValues).not.toContain(secret);
      }

      await completeClaim(result, identity.userId);
      expect(result.current.guestClaimUserId).toBeNull();
    });

    it('survives a sign-out followed by a sign-in of the same id', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const { result } = await mountAuth();
      await signIn(result, identity);
      expect(result.current.guestClaimUserId).toBe(identity.userId);

      await signOut(result);
      expect(result.current.isSignedIn).toBe(false);
      await signIn(result, identity);

      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.guestClaimUserId).toBe(identity.userId);
    });

    it('is not cleared by completeGuestClaim with a different user id', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const first = await mountAuth();
      await signIn(first.result, identity);

      await completeClaim(first.result, randomUUID());

      expect(first.result.current.guestClaimUserId).toBe(identity.userId);
    });

    it('raises a claim for a second distinct user and persists both ids as known once their claims complete', async () => {
      const firstUser = buildIdentity();
      const secondUser = buildIdentity();
      const { setRoute } = installRoutedFetch(signInRoutes(firstUser));
      setRoute('POST auth/sessions', [sessionReply(firstUser), sessionReply(secondUser)]);
      const first = await mountAuth();

      await signIn(first.result, firstUser);
      expect(first.result.current.guestClaimUserId).toBe(firstUser.userId);
      await completeClaim(first.result, firstUser.userId);
      await signOut(first.result);
      await signIn(first.result, secondUser);
      expect(first.result.current.user).toEqual({ id: secondUser.userId });
      expect(first.result.current.guestClaimUserId).toBe(secondUser.userId);
      await completeClaim(first.result, secondUser.userId);
      expect(first.result.current.guestClaimUserId).toBeNull();

      await waitFor(async () =>
        expect(await storedKnownIds()).toEqual(expect.arrayContaining([firstUser.userId, secondUser.userId])),
      );
      await flush();
      await first.unmount();

      const second = await mountAuth();
      await signOut(second.result);
      setRoute('POST auth/sessions', [sessionReply(firstUser), sessionReply(secondUser)]);
      await signIn(second.result, firstUser);
      expect(second.result.current.guestClaimUserId).toBeNull();
      await signOut(second.result);
      await signIn(second.result, secondUser);
      expect(second.result.current.guestClaimUserId).toBeNull();
    });
  });

  describe('calls made before hydration finishes', () => {
    it('verifyCode before hydration keeps a stored known id known and stays signed in after hydration', async () => {
      const identity = buildIdentity();
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ userId: null, knownUserIds: [identity.userId] }));
      installRoutedFetch(signInRoutes(identity));
      const hold = holdIdentityRead();
      const { result } = await renderHook(() => useAuth(), { wrapper: AuthProvider });
      expect(result.current.isHydrated).toBe(false);

      let pending: Promise<unknown> = Promise.resolve();
      await act(async () => {
        pending = result.current.verifyCode(identity.email, identity.code);
      });
      await flush();
      let outcome: unknown;
      await act(async () => {
        hold.release();
        outcome = await pending;
      });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));
      await flush();

      expect(outcome).toEqual({ isOk: true });
      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.user).toEqual({ id: identity.userId });
      expect(result.current.guestClaimUserId).toBeNull();
      expect(await storedUserId()).toBe(identity.userId);
      expect(await storedKnownIds()).toContain(identity.userId);
    });

    it('signOut before hydration stays signed out after hydration resolves and keeps the known ids', async () => {
      const identity = buildIdentity();
      await AsyncStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ userId: identity.userId, knownUserIds: [identity.userId] }),
      );
      secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
      installRoutedFetch(signInRoutes(identity));
      const hold = holdIdentityRead();
      const rendered = await renderHook(() => useAuth(), { wrapper: AuthProvider });
      expect(rendered.result.current.isHydrated).toBe(false);

      let pending: Promise<unknown> = Promise.resolve();
      await act(async () => {
        pending = rendered.result.current.signOut();
      });
      await flush();
      await act(async () => {
        hold.release();
        await pending;
      });
      await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
      await flush();

      expect(rendered.result.current.isSignedIn).toBe(false);
      expect(rendered.result.current.user).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      expect(await storedUserId()).toBeNull();
      expect(await storedKnownIds()).toContain(identity.userId);
      await rendered.unmount();

      const remounted = await mountAuth();
      expect(remounted.result.current.isSignedIn).toBe(false);
    });

    it('a failed identity read does not overwrite the stored known ids on the next sign-in', async () => {
      const earlierUserId = randomUUID();
      const identity = buildIdentity();
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ userId: null, knownUserIds: [earlierUserId] }));
      installRoutedFetch(signInRoutes(identity));
      const consoleCapture = captureConsole();
      try {
        failIdentityRead();
        const { result } = await mountAuth();

        expect(await signIn(result, identity)).toEqual({ isOk: true });
        await flush();

        expect(result.current.isSignedIn).toBe(true);
        expect(await storedKnownIds()).toContain(earlierUserId);
      } finally {
        consoleCapture.restore();
      }
    });
  });

  describe('overlapping sign-in and sign-out', () => {
    it('leaves the new user signed in when verifyCode completes while a sign-out DELETE is still pending', async () => {
      const previousUser = buildIdentity();
      const newUser = buildIdentity();
      const heldDelete = holdReply();
      const { requests, setRoute } = installRoutedFetch({
        ...signInRoutes(previousUser),
        'DELETE auth/sessions/current': heldDelete,
      });
      setRoute('POST auth/sessions', [sessionReply(previousUser), sessionReply(newUser)]);
      const { result } = await mountAuth();
      await signIn(result, previousUser);

      let pendingSignOut: Promise<unknown> = Promise.resolve();
      await act(async () => {
        pendingSignOut = result.current.signOut();
      });
      await waitFor(() => expect(requests.some((request) => request.method === 'DELETE')).toBe(true));

      expect(await signIn(result, newUser)).toEqual({ isOk: true });
      await act(async () => {
        heldDelete.release({ status: 204 });
        await pendingSignOut;
      });
      await flush();

      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.user).toEqual({ id: newUser.userId });
      expect(secureStore.mockValues.get(SESSION_TOKEN_KEY)).toBe(newUser.sessionValue);
      expect(await storedUserId()).toBe(newUser.userId);
    });

    it('resolves a second concurrent verifyCode as unavailable without changing state', async () => {
      const firstUser = buildIdentity();
      const secondUser = buildIdentity();
      const heldSession = holdReply();
      installRoutedFetch({
        'POST auth/sessions': [heldSession, sessionReply(secondUser)],
        'DELETE auth/sessions/current': { status: 204 },
      });
      const { result } = await mountAuth();

      let firstPending: Promise<unknown> = Promise.resolve();
      await act(async () => {
        firstPending = result.current.verifyCode(firstUser.email, firstUser.code);
      });
      let secondOutcome: unknown;
      await act(async () => {
        secondOutcome = await result.current.verifyCode(secondUser.email, secondUser.code);
      });
      await flush();

      expect(secondOutcome).toEqual({ isOk: false, reason: 'unavailable' });
      expect(result.current.isSignedIn).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.guestClaimUserId).toBeNull();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);

      let firstOutcome: unknown;
      await act(async () => {
        heldSession.release(sessionReply(firstUser));
        firstOutcome = await firstPending;
      });

      expect(firstOutcome).toEqual({ isOk: true });
      expect(result.current.user).toEqual({ id: firstUser.userId });
      expect(secureStore.mockValues.get(SESSION_TOKEN_KEY)).toBe(firstUser.sessionValue);
    });
  });

  describe('signOut when the secure-store delete fails', () => {
    it('still signs out locally, resolves, and logs a warning that holds no session value, email, or code', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const consoleCapture = captureConsole();
      try {
        const first = await mountAuth();
        await signIn(first.result, identity);
        secureStore.deleteItemAsync.mockImplementation(() =>
          Promise.reject(new Error('keychain delete failed')),
        );

        let rejection: unknown = null;
        await act(async () => {
          await first.result.current.signOut().catch((error: unknown) => {
            rejection = error;
          });
        });
        await flush();

        expect(rejection).toBeNull();
        expect(first.result.current.isSignedIn).toBe(false);
        expect(first.result.current.user).toBeNull();
        expect(await storedUserId()).toBeNull();
        const warnings = consoleCapture.serialisedFor('warn');
        expect(warnings).toContain('"level":"warn"');
        const logged = consoleCapture.serialised();
        for (const secret of [identity.sessionValue, identity.email, identity.code]) {
          expect(logged).not.toContain(secret);
        }
        await first.unmount();

        secureStore.deleteItemAsync.mockImplementation(secureStore.mockDefaults.deleteItemAsync);
        const second = await mountAuth();
        expect(second.result.current.isSignedIn).toBe(false);
      } finally {
        consoleCapture.restore();
      }
    });
  });

  describe('stored identity', () => {
    it.each([
      ['text that is not JSON', 'not json {'],
      ['a JSON number', '42'],
      ['a JSON array', '[1,2]'],
      ['a numeric userId', JSON.stringify({ userId: 7, knownUserIds: [] })],
      ['a knownUserIds that is not an array', JSON.stringify({ userId: null, knownUserIds: 'abc' })],
      ['a known id that is not a string', JSON.stringify({ userId: null, knownUserIds: [3] })],
    ])('starts signed out without throwing when syntactical.auth.v1 holds %s', async (_label, raw) => {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, raw);
      installRoutedFetch({});
      const consoleCapture = captureConsole();
      try {
        const { result } = await mountAuth();

        expect(result.current.isSignedIn).toBe(false);
        expect(result.current.user).toBeNull();
        expect(result.current.guestClaimUserId).toBeNull();
      } finally {
        consoleCapture.restore();
      }
    });

    it('clears the persisted userId on sign-out but keeps knownUserIds', async () => {
      const identity = buildIdentity();
      installRoutedFetch(signInRoutes(identity));
      const { result } = await mountAuth();
      await signIn(result, identity);
      await completeClaim(result, identity.userId);

      await signOut(result);
      await flush();

      expect(await storedUserId()).toBeNull();
      expect(await storedKnownIds()).toContain(identity.userId);
    });
  });
});
