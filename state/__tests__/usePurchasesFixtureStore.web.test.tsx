// state/__tests__/usePurchasesFixtureStore.web.test.tsx
// On the web, the fixture store confirms in place (no Web Billing, no checkout redirect), while
// the production web store still hands a finished checkout to /purchase-complete.
import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import {
  ANNUAL_PRODUCT,
  SIGNED_IN_USER,
  fakeAuth,
  resetFakes,
  webBilling,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { usePurchases } from '../usePurchases';

import { installRoutedFetch, type FakeReply } from './authTestSupport';

const LOOPBACK_API = 'http://127.0.0.1:4711/v1/';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../clients/webBillingClient', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildWebBillingModule(),
);
jest.mock('../../state/AuthProvider', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: () => undefined }));

const ACTIVE: FakeReply = {
  status: 200,
  body: {
    data: { dailyGoal: 20, dayStreak: 0, pro: { expiresAt: null, isActive: true, product: 'lifetime' }, xpToday: 0 },
  },
};

let queryClient: ReturnType<typeof createQueryClient>;

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  resetFakes();
  fakeAuth.userId = SIGNED_IN_USER;
  queryClient = createQueryClient();
});

afterEach(() => {
  queryClient.clear();
});

describe('usePurchases on the web', () => {
  it('confirms a fixture purchase in place, without Web Billing or a redirect', async () => {
    setExpoExtra({ apiBaseUrl: LOOPBACK_API });
    installRoutedFetch({
      [`POST ${LOOPBACK_API}test/webhook`]: { status: 200, body: { data: { status: 'recorded' } } },
      [`GET ${LOOPBACK_API}me`]: ACTIVE,
    });
    const { result } = renderHook(() => usePurchases(), { wrapper: QueryWrapper });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.buy(ANNUAL_PRODUCT);
    });
    expect(outcome).toBe('unlocked');
    expect(webBilling.purchasedProductIds).toEqual([]);
  });

  it('still redirects a production Web Billing checkout to purchase-complete', async () => {
    setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });
    const { requests } = installRoutedFetch({ 'GET me': ACTIVE });
    const { result } = renderHook(() => usePurchases(), { wrapper: QueryWrapper });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.buy(ANNUAL_PRODUCT);
    });
    expect(outcome).toBe('redirect');
    expect(webBilling.purchasedProductIds).toEqual([ANNUAL_PRODUCT]);
    expect(requests).toHaveLength(0);
  });
});
