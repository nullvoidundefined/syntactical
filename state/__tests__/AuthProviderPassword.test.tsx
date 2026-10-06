// AuthProvider password sign-in on native (Task 7.7; B-86, B-90):
// signInWithPassword posts the email, the password, and the device time zone
// to auth/sessions/password, and a 201 takes the existing sign-in path (the
// session value in expo-secure-store only, the guest claim raised for a new id,
// the purchaser and analytics identified by user id). Each failure maps to
// one AuthResult reason. Across a failed and a successful sign-in on the real
// screen and an unmount, the password reaches the API request body and
// nothing else: no AsyncStorage write, SecureStore write, logWarning call,
// analytics call, or console call. The real apiFetch runs against a routed
// fetch stand-in; every value is built at run time.
import { randomBytes } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import SignInScreen from '../../app/sign-in';
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
  type FakeReply,
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

const mockIdentifyPurchaser = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockResetPurchaser = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('../../clients/purchasesIdentity', () => ({
  identifyPurchaser: (...args: unknown[]) => mockIdentifyPurchaser(...args),
  resetPurchaser: (...args: unknown[]) => mockResetPurchaser(...args),
}));

const mockIdentifyAnalytics = jest.fn();
const mockResetAnalytics = jest.fn();
const mockTrackEvent = jest.fn();
jest.mock('../../clients/analyticsClient', () => ({
  identifyAnalyticsUser: (...args: unknown[]) => mockIdentifyAnalytics(...args),
  resetAnalyticsUser: (...args: unknown[]) => mockResetAnalytics(...args),
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

// The real logWarning still runs (it writes to console.warn), and every call is recorded.
const mockLogWarning = jest.fn();
jest.mock('../../clients/logClient', () => {
  const actual = jest.requireActual('../../clients/logClient');
  return {
    ...actual,
    logWarning: (...args: unknown[]) => {
      mockLogWarning(...args);
      return actual.logWarning(...args);
    },
  };
});

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  }),
}));

type SecureStoreMock = {
  mockValues: Map<string, string>;
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const secureStore = jest.requireMock('expo-secure-store') as SecureStoreMock;

const PASSWORD_ROUTE = 'POST auth/sessions/password';
const INVALID_CREDENTIALS_MESSAGE = 'That email and password do not match. Try again, or use a code instead.';
const UNAVAILABLE_MESSAGE = 'Sign-in is unavailable right now. Try again later.';

type AuthValue = ReturnType<typeof useAuth>;

// A password built at run time: two random words around a space, so the
// space-keeping path is exercised too.
function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

function errorReply(status: number, code: string): FakeReply {
  return { status, body: { error: { code, message: 'refused', requestId: 'r1' } } };
}

function successReply(identity: SignInIdentity): FakeReply {
  return { status: 201, body: { data: { token: identity.sessionValue, userId: identity.userId } } };
}

async function mountAuth() {
  const rendered = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

async function signInWithPassword(result: { current: AuthValue }, email: string, typedPassword: string) {
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.signInWithPassword(email, typedPassword);
  });
  return outcome;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
});

describe('AuthProvider signInWithPassword on native', () => {
  it('posts the email, the password, and the device IANA time zone to auth/sessions/password as a native client', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: successReply(identity) });
    const restoreTimeZone = pinDeviceTimeZone('Pacific/Chatham');
    try {
      const { result } = await mountAuth();
      await signInWithPassword(result, identity.email, password);
    } finally {
      restoreTimeZone();
    }

    const posted = requests.filter((request) => request.path === 'auth/sessions/password');
    expect(posted).toHaveLength(1);
    expect(posted[0].method).toBe('POST');
    expect(posted[0].headers['x-client']).toBe('native');
    expect(posted[0].body).toEqual({ email: identity.email, password, timezone: 'Pacific/Chatham' });
  });

  it('signs in on 201: the session value goes to expo-secure-store only and the user id is persisted', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PASSWORD_ROUTE]: successReply(identity) });
    const { result } = await mountAuth();

    const outcome = await signInWithPassword(result, identity.email, buildPassword());

    expect(outcome).toEqual({ isOk: true });
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.user).toEqual({ id: identity.userId });
    expect(secureStore.mockValues.get(SESSION_TOKEN_KEY)).toBe(identity.sessionValue);
    await waitFor(async () => expect((await readStoredAuth())?.userId).toBe(identity.userId));
  });

  it('raises the guest claim for a user id new to this device and identifies the purchaser and analytics by user id', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PASSWORD_ROUTE]: successReply(identity) });
    const { result } = await mountAuth();

    await signInWithPassword(result, identity.email, buildPassword());

    expect(result.current.guestClaimUserId).toBe(identity.userId);
    expect(mockIdentifyPurchaser).toHaveBeenCalledWith(identity.userId);
    expect(mockIdentifyAnalytics).toHaveBeenCalledWith(identity.userId);
    expect(JSON.stringify(mockIdentifyAnalytics.mock.calls)).not.toContain(identity.email);
  });

  it('raises no guest claim for a user id that already signed in on this device', async () => {
    const identity = buildIdentity();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [identity.userId], userId: null }));
    installRoutedFetch({ [PASSWORD_ROUTE]: successReply(identity) });
    const { result } = await mountAuth();

    await signInWithPassword(result, identity.email, buildPassword());

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.guestClaimUserId).toBeNull();
  });

  it.each([
    ['400 AUTH_INVALID_CREDENTIALS', 'invalid-credentials', errorReply(400, 'AUTH_INVALID_CREDENTIALS')],
    ['400 INPUT_INVALID_BODY', 'invalid-credentials', errorReply(400, 'INPUT_INVALID_BODY')],
    ['429 RATE_LIMIT_EXCEEDED', 'rate-limited', errorReply(429, 'RATE_LIMIT_EXCEEDED')],
    ['503 SERVER_BUSY', 'busy', errorReply(503, 'SERVER_BUSY')],
    ['503 with another code', 'unavailable', errorReply(503, 'SERVER_EMAIL_UNAVAILABLE')],
    ['500', 'unavailable', errorReply(500, 'SERVER_INTERNAL')],
    ['a network failure', 'unavailable', 'reject' as const],
  ])('reports %s as %s and stays signed out with nothing stored', async (_label, reason, reply) => {
    const identity = buildIdentity();
    installRoutedFetch({ [PASSWORD_ROUTE]: reply });
    const { result } = await mountAuth();

    const outcome = await signInWithPassword(result, identity.email, buildPassword());

    expect(outcome).toEqual({ isOk: false, reason });
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.guestClaimUserId).toBeNull();
    expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
    expect((await readStoredAuth())?.userId ?? null).toBeNull();
    expect(mockIdentifyPurchaser).not.toHaveBeenCalled();
  });

  it.each([
    ['no session value', (identity: SignInIdentity) => ({ status: 201, body: { data: { userId: identity.userId } } })],
    ['no user id', (identity: SignInIdentity) => ({ status: 201, body: { data: { token: identity.sessionValue } } })],
  ])('treats a native 201 with %s as unavailable and stays signed out', async (_label, buildReply) => {
    const identity = buildIdentity();
    installRoutedFetch({ [PASSWORD_ROUTE]: buildReply(identity) });
    const { result } = await mountAuth();

    const outcome = await signInWithPassword(result, identity.email, buildPassword());

    expect(outcome).toEqual({ isOk: false, reason: 'unavailable' });
    expect(result.current.isSignedIn).toBe(false);
    expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
  });
});

describe('the password never leaves memory except in the sign-in request (B-90)', () => {
  function serialiseCalls(mock: jest.Mock): string {
    return JSON.stringify(mock.mock.calls);
  }

  it('reaches no AsyncStorage, SecureStore, logWarning, analytics, or console call across a failure, a success, and an unmount', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    const consoleCapture = captureConsole();
    const storageSpies = [
      jest.spyOn(AsyncStorage, 'setItem'),
      jest.spyOn(AsyncStorage, 'multiSet'),
      jest.spyOn(AsyncStorage, 'mergeItem'),
      jest.spyOn(AsyncStorage, 'multiMerge'),
    ];
    try {
      const { requests } = installRoutedFetch({
        [PASSWORD_ROUTE]: [errorReply(400, 'AUTH_INVALID_CREDENTIALS'), successReply(identity)],
      });
      const rendered = await render(
        <AuthProvider>
          <SignInScreen />
        </AuthProvider>,
      );
      await screen.findByLabelText('Email address');

      // A failed attempt.
      await fireEvent.changeText(screen.getByLabelText('Email address'), identity.email);
      await fireEvent.changeText(screen.getByLabelText('Password'), password);
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByText(INVALID_CREDENTIALS_MESSAGE)).toBeTruthy();

      // A successful attempt with the same password.
      await fireEvent.changeText(screen.getByLabelText('Password'), password);
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
      // The field is cleared once the sign-in succeeds.
      expect(screen.getByLabelText('Password').props.value).toBe('');

      await rendered.unmount();
      await act(async () => undefined);

      // Control: the password did travel, in the two request bodies and nowhere else.
      const passwordRequests = requests.filter((request) => request.path === 'auth/sessions/password');
      expect(passwordRequests).toHaveLength(2);
      for (const request of passwordRequests) expect(request.body).toMatchObject({ password });
      const otherRequests = requests.filter((request) => request.path !== 'auth/sessions/password');
      expect(JSON.stringify(otherRequests)).not.toContain(password);

      for (const spy of storageSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(password);
      expect((await readAllStoredValues()).join('\n')).not.toContain(password);
      expect(serialiseCalls(secureStore.setItemAsync)).not.toContain(password);
      expect(secureStore.setItemAsync.mock.calls).toEqual([[SESSION_TOKEN_KEY, identity.sessionValue]]);
      expect(serialiseCalls(mockLogWarning)).not.toContain(password);
      expect(serialiseCalls(mockIdentifyAnalytics)).not.toContain(password);
      expect(serialiseCalls(mockResetAnalytics)).not.toContain(password);
      expect(serialiseCalls(mockTrackEvent)).not.toContain(password);
      expect(serialiseCalls(mockIdentifyPurchaser)).not.toContain(password);
      expect(consoleCapture.serialised()).not.toContain(password);
    } finally {
      for (const spy of storageSpies) spy.mockRestore();
      consoleCapture.restore();
    }
  });

  it('reports a network rejection as unavailable and the password reaches no AsyncStorage, SecureStore, logWarning, analytics, purchaser, or console call', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    const consoleCapture = captureConsole();
    const storageSpies = [
      jest.spyOn(AsyncStorage, 'setItem'),
      jest.spyOn(AsyncStorage, 'multiSet'),
      jest.spyOn(AsyncStorage, 'mergeItem'),
      jest.spyOn(AsyncStorage, 'multiMerge'),
    ];
    try {
      const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: 'reject' });

      // The provider's own result for a rejected fetch.
      const hook = await mountAuth();
      const outcome = await signInWithPassword(hook.result, identity.email, password);
      expect(outcome).toEqual({ isOk: false, reason: 'unavailable' });
      expect(hook.result.current.isSignedIn).toBe(false);
      await hook.unmount();

      // The same rejection through the real screen.
      const rendered = await render(
        <AuthProvider>
          <SignInScreen />
        </AuthProvider>,
      );
      await screen.findByLabelText('Email address');
      await fireEvent.changeText(screen.getByLabelText('Email address'), identity.email);
      await fireEvent.changeText(screen.getByLabelText('Password'), password);
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByText(UNAVAILABLE_MESSAGE)).toBeTruthy();
      expect(mockReplace).not.toHaveBeenCalled();
      await rendered.unmount();
      await act(async () => undefined);

      // Control: both attempts did try to send the password.
      const passwordRequests = requests.filter((request) => request.path === 'auth/sessions/password');
      expect(passwordRequests).toHaveLength(2);
      for (const request of passwordRequests) expect(request.body).toMatchObject({ password });
      const otherRequests = requests.filter((request) => request.path !== 'auth/sessions/password');
      expect(JSON.stringify(otherRequests)).not.toContain(password);

      for (const spy of storageSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(password);
      expect((await readAllStoredValues()).join('\n')).not.toContain(password);
      expect(secureStore.setItemAsync).not.toHaveBeenCalled();
      expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
      expect(serialiseCalls(mockLogWarning)).not.toContain(password);
      expect(serialiseCalls(mockIdentifyAnalytics)).not.toContain(password);
      expect(serialiseCalls(mockResetAnalytics)).not.toContain(password);
      expect(serialiseCalls(mockTrackEvent)).not.toContain(password);
      expect(serialiseCalls(mockIdentifyPurchaser)).not.toContain(password);
      expect(serialiseCalls(mockResetPurchaser)).not.toContain(password);
      expect(consoleCapture.serialised()).not.toContain(password);
    } finally {
      for (const spy of storageSpies) spy.mockRestore();
      consoleCapture.restore();
    }
  });

  it('starts with an empty password field when the screen is mounted again after an unmount', async () => {
    installRoutedFetch({});
    const first = await render(
      <AuthProvider>
        <SignInScreen />
      </AuthProvider>,
    );
    await fireEvent.changeText(await screen.findByLabelText('Password'), buildPassword());
    await first.unmount();

    await render(
      <AuthProvider>
        <SignInScreen />
      </AuthProvider>,
    );
    expect((await screen.findByLabelText('Password')).props.value).toBe('');
  });
});
