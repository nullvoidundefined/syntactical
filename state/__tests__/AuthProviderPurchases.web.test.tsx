// AuthProvider on web keeps the RevenueCat Web Billing purchaser identity in
// step with sign-in: a successful sign-in or a hydrated signed-in user
// configures Web Billing with the server user id as appUserId, a guest never
// configures it, and every sign-out path (explicit, and the local sign-out a
// 401 triggers) closes it so the next sign-in configures only the new id.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react';

import { apiFetch } from '../../clients/apiClient';
import { AuthProvider, useAuth } from '../AuthProvider';
import {
  AUTH_STORAGE_KEY,
  buildIdentity,
  installRoutedFetch,
  type SignInIdentity,
} from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      apiBaseUrl: 'https://api.syntactical.dev/v1/',
      // Built at run time so no credential-shaped literal sits in source.
      revenueCatWebBillingKey: `rcb_${require('node:crypto').randomBytes(12).toString('hex')}`,
    },
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

type FakeInstance = { appUserId: string; close: jest.Mock; isClosed: boolean };

type PurchasesJsMock = {
  Purchases: { configure: jest.Mock; getSharedInstance: jest.Mock; isConfigured: jest.Mock };
  mockState: { instances: FakeInstance[]; shared: FakeInstance | null };
};

jest.mock('@revenuecat/purchases-js', () => {
  const mockState: PurchasesJsMock['mockState'] = { instances: [], shared: null };
  const Purchases = {
    configure: jest.fn((config: { appUserId: string }) => {
      const instance: FakeInstance = {
        appUserId: config.appUserId,
        isClosed: false,
        close: jest.fn(() => {
          instance.isClosed = true;
          if (mockState.shared === instance) {
            mockState.shared = null;
          }
        }),
      };
      mockState.instances.push(instance);
      mockState.shared = instance;
      return instance;
    }),
    getSharedInstance: jest.fn(() => {
      if (mockState.shared === null) {
        throw new Error('Purchases must be configured before calling getSharedInstance');
      }
      return mockState.shared;
    }),
    isConfigured: jest.fn(() => mockState.shared !== null),
  };
  return {
    __esModule: true,
    ErrorCode: { UnknownError: 0, UserCancelledError: 1 },
    Purchases,
    PurchasesError: class PurchasesError extends Error {},
    mockState,
  };
});

const sdk = jest.requireMock('@revenuecat/purchases-js') as PurchasesJsMock;
const constants = jest.requireMock('expo-constants') as { expoConfig: { extra: Record<string, string> } };

function configuredUserIds(): string[] {
  return sdk.mockState.instances.map((instance) => instance.appUserId);
}

function openUserIds(): string[] {
  return sdk.mockState.instances.filter((instance) => !instance.isClosed).map((instance) => instance.appUserId);
}

function sessionRoute(identity: SignInIdentity) {
  return { status: 201, body: { data: { userId: identity.userId } } };
}

async function mountAuth() {
  const rendered = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

async function signIn(result: { current: ReturnType<typeof useAuth> }, identity: SignInIdentity): Promise<unknown> {
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.verifyCode(identity.email, identity.code);
  });
  return outcome;
}

describe('AuthProvider on web: RevenueCat Web Billing identity', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    // Close whatever a test left open so the next test starts unconfigured.
    for (const instance of sdk.mockState.instances) {
      instance.isClosed = true;
    }
    sdk.mockState.instances = [];
    sdk.mockState.shared = null;
  });

  it('never configures Web Billing for a guest or a failed sign-in, then configures it with the public key and the server user id after a successful sign-in', async () => {
    const identity = buildIdentity();
    const { setRoute } = installRoutedFetch({
      'POST auth/sessions': { status: 400, body: { error: { code: 'AUTH_INVALID_CODE', message: 'invalid', requestId: 'r1' } } },
    });
    const { result } = await mountAuth();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.isSignedIn).toBe(false);
    expect(configuredUserIds()).toEqual([]);

    expect(await signIn(result, identity)).toEqual({ isOk: false, reason: 'invalid-code' });
    expect(configuredUserIds()).toEqual([]);

    setRoute('POST auth/sessions', sessionRoute(identity));
    expect(await signIn(result, identity)).toEqual({ isOk: true });

    await waitFor(() => expect(configuredUserIds()).toEqual([identity.userId]));
    const [configArg] = sdk.Purchases.configure.mock.calls[0] as [Record<string, unknown>];
    expect(configArg).toHaveProperty('appUserId', identity.userId);
    expect(configArg).toHaveProperty('apiKey', constants.expoConfig.extra.revenueCatWebBillingKey);
    expect(openUserIds()).toEqual([identity.userId]);
  });

  it('configures Web Billing for a stored signed-in user on hydration', async () => {
    const identity = buildIdentity();
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ userId: identity.userId, knownUserIds: [identity.userId] }),
    );
    installRoutedFetch({});

    const { result } = await mountAuth();

    expect(result.current.user).toEqual({ id: identity.userId });
    await waitFor(() => expect(configuredUserIds()).toEqual([identity.userId]));
    expect(openUserIds()).toEqual([identity.userId]);
  });

  it('closes Web Billing on explicit sign-out, so a following sign-in as another user configures only the new id', async () => {
    const first = buildIdentity();
    const second = buildIdentity();
    const { setRoute } = installRoutedFetch({
      'POST auth/sessions': sessionRoute(first),
      'DELETE auth/sessions/current': { status: 204 },
    });
    const { result } = await mountAuth();
    await signIn(result, first);
    await waitFor(() => expect(configuredUserIds()).toEqual([first.userId]));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isSignedIn).toBe(false);
    await waitFor(() => expect(openUserIds()).toEqual([]));

    setRoute('POST auth/sessions', sessionRoute(second));
    await signIn(result, second);

    await waitFor(() => expect(configuredUserIds()).toEqual([first.userId, second.userId]));
    expect(openUserIds()).toEqual([second.userId]);
  });

  it('closes Web Billing on the local sign-out a 401 triggers, so a following sign-in as another user configures only the new id', async () => {
    const first = buildIdentity();
    const second = buildIdentity();
    const { setRoute } = installRoutedFetch({
      'POST auth/sessions': sessionRoute(first),
      'GET answer-events': {
        status: 401,
        body: { error: { code: 'AUTH_SESSION_REQUIRED', message: 'session required', requestId: 'r1' } },
      },
    });
    const { result } = await mountAuth();
    await signIn(result, first);
    await waitFor(() => expect(configuredUserIds()).toEqual([first.userId]));

    await act(async () => {
      await apiFetch('answer-events').catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isSignedIn).toBe(false));
    await waitFor(() => expect(openUserIds()).toEqual([]));

    setRoute('POST auth/sessions', sessionRoute(second));
    await signIn(result, second);

    await waitFor(() => expect(configuredUserIds()).toEqual([first.userId, second.userId]));
    expect(openUserIds()).toEqual([second.userId]);
  });
});
