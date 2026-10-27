// state/__tests__/usePurchasesFixtureStore.test.tsx
// usePurchases chooses its store from the API base URL at call time. Under an http loopback URL
// (the e2e build) it lists the fixture store's fixed prices without touching the SDK, and a
// purchase posts the synthetic webhook event for the signed-in user, then confirms through GET me;
// a refused webhook buys nothing. Under the production https URL it uses react-native-purchases
// and never posts to test/webhook.
import { randomBytes } from 'node:crypto';
import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  ANNUAL_PRODUCT,
  SIGNED_IN_USER,
  fakeAuth,
  nativeSdk,
  resetFakes,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { usePurchases } from '../usePurchases';

import { installRoutedFetch, type FakeReply } from './authTestSupport';

const LOOPBACK_API = 'http://127.0.0.1:4711/v1/';
const PRODUCTION_API = 'https://api.syntactical.dev/v1/';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-purchases', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildNativePurchasesModule(),
);
jest.mock('../../state/AuthProvider', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: () => undefined }));

const ACTIVE: FakeReply = {
  status: 200,
  body: {
    data: {
      dailyGoal: 20,
      dayStreak: 0,
      pro: { expiresAt: '2027-10-27T12:00:00.000Z', isActive: true, product: 'annual' },
      xpToday: 0,
    },
  },
};

let queryClient: ReturnType<typeof createQueryClient>;

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Built at run time so no credential-shaped literal sits in source.
function useApi(apiBaseUrl: string): void {
  setExpoExtra({ apiBaseUrl, revenueCatAppleKey: `appl_${randomBytes(12).toString('hex')}` });
}

function readSdk() {
  return require('react-native-purchases').default as Record<string, jest.Mock>;
}

beforeEach(() => {
  resetFakes();
  fakeAuth.userId = SIGNED_IN_USER;
  queryClient = createQueryClient();
});

afterEach(() => {
  queryClient.clear();
});

describe('usePurchases with the fixture store', () => {
  it('lists the fixed prices without asking the SDK', async () => {
    useApi(LOOPBACK_API);
    installRoutedFetch({});
    const { result } = await renderHook(() => usePurchases({ shouldLoadPrices: true }), { wrapper: QueryWrapper });
    await waitFor(() =>
      expect(result.current.prices).toEqual({
        'syntactical.pro.annual': '$19.99',
        'syntactical.pro.lifetime': '$39.99',
      }),
    );
    expect(readSdk().getOfferings.mock.calls).toHaveLength(0);
  });

  it('posts the webhook event for the signed-in user, then confirms through GET me', async () => {
    useApi(LOOPBACK_API);
    const { requests } = installRoutedFetch({
      [`POST ${LOOPBACK_API}test/webhook`]: { status: 200, body: { data: { status: 'recorded' } } },
      [`GET ${LOOPBACK_API}me`]: ACTIVE,
    });
    const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.buy(ANNUAL_PRODUCT);
    });
    expect(outcome).toBe('unlocked');
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `POST ${LOOPBACK_API}test/webhook`,
      `GET ${LOOPBACK_API}me`,
    ]);
    expect(requests[0].body).toMatchObject({
      event: { app_user_id: SIGNED_IN_USER, product_id: ANNUAL_PRODUCT, type: 'INITIAL_PURCHASE' },
    });
    expect(nativeSdk.purchasedProductIds).toEqual([]);
  });

  it('buys nothing when the test webhook refuses the event', async () => {
    useApi(LOOPBACK_API);
    const { requests } = installRoutedFetch({
      [`POST ${LOOPBACK_API}test/webhook`]: { status: 404 },
      [`GET ${LOOPBACK_API}me`]: ACTIVE,
    });
    const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.buy(ANNUAL_PRODUCT);
    });
    expect(outcome).toBe('unavailable');
    expect(requests.some(({ method }) => method === 'GET')).toBe(false);
  });
});

describe('usePurchases with the production API', () => {
  it('buys through react-native-purchases and never posts to test/webhook', async () => {
    useApi(PRODUCTION_API);
    const { requests } = installRoutedFetch({ 'GET me': ACTIVE });
    const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.buy(ANNUAL_PRODUCT);
    });
    expect(outcome).toBe('unlocked');
    expect(nativeSdk.purchasedProductIds).toEqual([ANNUAL_PRODUCT]);
    expect(requests.some(({ path }) => path.includes('test/webhook'))).toBe(false);
  });
});
