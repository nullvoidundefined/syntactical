import { randomUUID } from 'node:crypto';
import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { trackEvent } from '../../clients/analyticsClient';
import { fakeAuth } from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import { buildEntitlementsKey } from '../useEntitlements';
import { usePurchases } from '../usePurchases';

import { holdReply, installRoutedFetch, type FakeReply } from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../state/AuthProvider', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);

jest.mock('../../clients/analyticsClient', () => ({ trackEvent: jest.fn() }));

jest.mock('../../clients/purchaseStoreClient', () => ({
  buyStoreProduct: jest.fn(),
  readStorePrices: jest.fn(() => Promise.resolve({})),
  restoreStorePurchases: jest.fn(),
}));

const PRODUCT = 'syntactical.python.medium';
let queryClient: ReturnType<typeof createQueryClient>;

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function profileReply(entitlements: string[]): FakeReply {
  return {
    status: 200,
    body: {
      data: {
        dailyGoal: 10,
        dayStreak: 0,
        email: 'reader@example.test',
        entitlements,
        timezone: null,
        xpToday: 0,
        xpTotal: 0,
      },
    },
  };
}

describe('usePurchases confirm cancellation', () => {
  beforeEach(() => {
    fakeAuth.userId = randomUUID();
    queryClient = createQueryClient();
    jest.mocked(trackEvent).mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns false without purchase_completed when aborted while GET me is pending', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ 'GET me': held });
    const controller = new AbortController();
    const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });

    const confirmation = result.current.confirm(PRODUCT, { signal: controller.signal });
    await waitFor(() => expect(requests).toHaveLength(1));
    controller.abort();
    await act(async () => {
      held.release(profileReply([PRODUCT]));
      await confirmation;
    });

    expect(queryClient.getQueryData(buildEntitlementsKey(fakeAuth.userId))).toEqual([PRODUCT]);
    await expect(confirmation).resolves.toBe(false);
    expect(trackEvent).not.toHaveBeenCalledWith('purchase_completed', expect.anything());
  });

  it('returns true and records one purchase_completed when the pending confirmation is not aborted', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ 'GET me': held });
    const controller = new AbortController();
    const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });

    const confirmation = result.current.confirm(PRODUCT, { signal: controller.signal });
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      held.release(profileReply([PRODUCT]));
      await confirmation;
    });

    await expect(confirmation).resolves.toBe(true);
    expect(jest.mocked(trackEvent).mock.calls).toEqual([['purchase_completed', { productId: PRODUCT }]]);
  });
});
