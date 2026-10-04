// AuthProvider on native keeps the RevenueCat purchaser identity in step with
// sign-in, so store webhooks carry the server user id: a successful sign-in or
// a hydrated signed-in user calls Purchases.logIn(user id), configuring the SDK
// with the platform's public key first when it is not yet configured; every
// sign-out path calls Purchases.logOut; a guest never logs in; and a rejected
// logIn or logOut never fails sign-in or sign-out and logs no user id.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiFetch } from '../../clients/apiClient';
import { AuthProvider, useAuth } from '../AuthProvider';
import {
  AUTH_STORAGE_KEY,
  buildIdentity,
  captureConsole,
  installRoutedFetch,
  type SignInIdentity,
} from './authTestSupport';

jest.mock('expo-constants', () => {
  // Built at run time so no credential-shaped literal sits in source.
  const { randomBytes } = require('node:crypto');
  return {
    expoConfig: {
      extra: {
        apiBaseUrl: 'https://api.syntactical.dev/v1/',
        revenueCatAppleKey: `appl_${randomBytes(12).toString('hex')}`,
        revenueCatGoogleKey: `goog_${randomBytes(12).toString('hex')}`,
        revenueCatWebBillingKey: `rcb_${randomBytes(12).toString('hex')}`,
      },
    },
  };
});

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

// `key` is the apiKey the SDK was configured with.
type SdkEvent = { kind: 'configure'; key: unknown } | { kind: 'logIn'; userId: string } | { kind: 'logOut' };

type NativePurchasesMock = {
  default: { configure: jest.Mock; isConfigured: jest.Mock; logIn: jest.Mock; logOut: jest.Mock };
  // A file-long record (clearMocks never empties it), since the SDK stays
  // configured for the whole test file once configured.
  mockEvents: SdkEvent[];
  mockState: { isConfigured: boolean; logInError: Error | null; logOutError: Error | null };
};

jest.mock('react-native-purchases', () => {
  const mockEvents: SdkEvent[] = [];
  const mockState: NativePurchasesMock['mockState'] = { isConfigured: false, logInError: null, logOutError: null };
  const Purchases = {
    configure: jest.fn((configuration: Record<string, unknown>) => {
      mockEvents.push({ kind: 'configure', key: configuration['apiKey'] });
      mockState.isConfigured = true;
    }),
    isConfigured: jest.fn(() => Promise.resolve(mockState.isConfigured)),
    logIn: jest.fn((userId: string) => {
      if (!mockState.isConfigured) {
        return Promise.reject(new Error('There is no singleton instance. Make sure you configure Purchases'));
      }
      mockEvents.push({ kind: 'logIn', userId });
      if (mockState.logInError) return Promise.reject(mockState.logInError);
      return Promise.resolve({ customerInfo: {}, created: false });
    }),
    logOut: jest.fn(() => {
      if (!mockState.isConfigured) {
        return Promise.reject(new Error('There is no singleton instance. Make sure you configure Purchases'));
      }
      mockEvents.push({ kind: 'logOut' });
      if (mockState.logOutError) return Promise.reject(mockState.logOutError);
      return Promise.resolve({});
    }),
  };
  return { __esModule: true, default: Purchases, mockEvents, mockState };
});

const purchases = jest.requireMock('react-native-purchases') as NativePurchasesMock;
const constants = jest.requireMock('expo-constants') as { expoConfig: { extra: Record<string, string> } };

type AuthValue = ReturnType<typeof useAuth>;

function signInRoutes(identity: SignInIdentity) {
  return {
    'POST auth/sessions': { status: 201, body: { data: { token: identity.sessionValue, userId: identity.userId } } },
    'DELETE auth/sessions/current': { status: 204 },
  };
}

async function mountAuth() {
  const rendered = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

async function signIn(result: { current: AuthValue }, identity: SignInIdentity): Promise<unknown> {
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.verifyCode(identity.email, identity.code);
  });
  return outcome;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function eventsSince(start: number): SdkEvent[] {
  return purchases.mockEvents.slice(start);
}

function logInIds(start: number): string[] {
  return eventsSince(start).flatMap((event) => (event.kind === 'logIn' ? [event.userId] : []));
}

function logOutCount(start: number): number {
  return eventsSince(start).filter((event) => event.kind === 'logOut').length;
}

// An SDK rejection whose own message names the user id, so logging the raw
// error would leak it.
function rejectionNaming(userId: string): Error {
  return new Error(`request failed for app user ${userId}`);
}

describe('AuthProvider on native: RevenueCat purchaser identity', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (jest.requireMock('expo-secure-store') as { mockValues: Map<string, string> }).mockValues.clear();
    purchases.mockState.logInError = null;
    purchases.mockState.logOutError = null;
  });

  it('never logs a guest or a failed sign-in in, then configures with the iOS public key once and logs in with the server user id after sign-in', async () => {
    const identity = buildIdentity();
    const start = purchases.mockEvents.length;
    const { setRoute } = installRoutedFetch({
      'POST auth/sessions': { status: 400, body: { error: { code: 'AUTH_INVALID_CODE', message: 'invalid', requestId: 'r1' } } },
    });
    const { result } = await mountAuth();
    await settle();
    expect(logInIds(start)).toEqual([]);

    expect(await signIn(result, identity)).toEqual({ isOk: false, reason: 'invalid-code' });
    await settle();
    expect(logInIds(start)).toEqual([]);

    setRoute('POST auth/sessions', signInRoutes(identity)['POST auth/sessions']);
    expect(await signIn(result, identity)).toEqual({ isOk: true });

    await waitFor(() => expect(logInIds(start)).toEqual([identity.userId]));
    const configures = purchases.mockEvents.filter((event) => event.kind === 'configure');
    expect(configures).toEqual([{ kind: 'configure', key: constants.expoConfig.extra.revenueCatAppleKey }]);
    const firstLogIn = purchases.mockEvents.findIndex((event) => event.kind === 'logIn');
    const firstConfigure = purchases.mockEvents.findIndex((event) => event.kind === 'configure');
    expect(firstConfigure).toBeGreaterThanOrEqual(0);
    expect(firstConfigure).toBeLessThan(firstLogIn);
  });

  it('logs in a stored signed-in user on hydration', async () => {
    const identity = buildIdentity();
    const start = purchases.mockEvents.length;
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ userId: identity.userId, knownUserIds: [identity.userId] }),
    );
    installRoutedFetch({});

    const { result } = await mountAuth();

    expect(result.current.user).toEqual({ id: identity.userId });
    await waitFor(() => expect(logInIds(start)).toEqual([identity.userId]));
  });

  it('logs out after an explicit sign-out, and a second sign-in configures nothing new and logs in the new id', async () => {
    const first = buildIdentity();
    const second = buildIdentity();
    const start = purchases.mockEvents.length;
    const { setRoute } = installRoutedFetch(signInRoutes(first));
    const { result } = await mountAuth();
    await signIn(result, first);
    await waitFor(() => expect(logInIds(start)).toEqual([first.userId]));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isSignedIn).toBe(false);
    await waitFor(() => expect(logOutCount(start)).toBe(1));

    setRoute('POST auth/sessions', signInRoutes(second)['POST auth/sessions']);
    await signIn(result, second);

    await waitFor(() => expect(logInIds(start)).toEqual([first.userId, second.userId]));
    expect(purchases.mockEvents.filter((event) => event.kind === 'configure')).toHaveLength(1);
  });

  it('logs out after the local sign-out a 401 triggers', async () => {
    const identity = buildIdentity();
    const start = purchases.mockEvents.length;
    installRoutedFetch({
      ...signInRoutes(identity),
      'GET answer-events': {
        status: 401,
        body: { error: { code: 'AUTH_SESSION_REQUIRED', message: 'session required', requestId: 'r1' } },
      },
    });
    const { result } = await mountAuth();
    await signIn(result, identity);
    await waitFor(() => expect(logInIds(start)).toEqual([identity.userId]));

    await act(async () => {
      await apiFetch('answer-events').catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isSignedIn).toBe(false));
    await waitFor(() => expect(logOutCount(start)).toBe(1));
  });

  it('keeps sign-in successful when logIn rejects, and logs no user id', async () => {
    const identity = buildIdentity();
    const start = purchases.mockEvents.length;
    purchases.mockState.logInError = rejectionNaming(identity.userId);
    installRoutedFetch(signInRoutes(identity));
    const consoleCapture = captureConsole();
    try {
      const { result } = await mountAuth();

      const outcome = await signIn(result, identity);
      await waitFor(() => expect(logInIds(start)).toEqual([identity.userId]));
      await settle();

      expect(outcome).toEqual({ isOk: true });
      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.user).toEqual({ id: identity.userId });
      expect(consoleCapture.serialised()).not.toContain(identity.userId);
    } finally {
      consoleCapture.restore();
    }
  });

  it('keeps sign-out complete when logOut rejects, and logs no user id', async () => {
    const identity = buildIdentity();
    const start = purchases.mockEvents.length;
    purchases.mockState.logOutError = rejectionNaming(identity.userId);
    installRoutedFetch(signInRoutes(identity));
    const consoleCapture = captureConsole();
    try {
      const { result } = await mountAuth();
      await signIn(result, identity);
      await waitFor(() => expect(logInIds(start)).toEqual([identity.userId]));

      let rejection: unknown = null;
      await act(async () => {
        await result.current.signOut().catch((error: unknown) => {
          rejection = error;
        });
      });
      await waitFor(() => expect(logOutCount(start)).toBe(1));
      await settle();

      expect(rejection).toBeNull();
      expect(result.current.isSignedIn).toBe(false);
      expect(result.current.user).toBeNull();
      expect(consoleCapture.serialised()).not.toContain(identity.userId);
    } finally {
      consoleCapture.restore();
    }
  });
});
