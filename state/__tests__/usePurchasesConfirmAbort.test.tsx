// usePurchases confirm cancellation: a caller that aborts while GET me is pending gets false and
// no event, though the refetched Pro status still lands in the useProStatus cache; one that does
// not abort gets true and one purchase_completed plus one pro_purchased.
import { randomUUID } from 'node:crypto';
import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { trackEvent } from '../../clients/analyticsClient';
import { fakeAuth } from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { usePurchases } from '../usePurchases';
import { buildProStatusKey } from '../useProStatus';

import { holdReply, installRoutedFetch, type FakeReply } from './authTestSupport';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });

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

const PRODUCT = 'syntactical.pro.annual';
const EXPIRY = '2027-10-27T12:00:00.000Z';
let queryClient: ReturnType<typeof createQueryClient>;

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function activeReply(): FakeReply {
  return {
    status: 200,
    body: {
      data: {
        dailyGoal: 10,
        dayStreak: 0,
        email: 'reader@example.test',
        pro: { expiresAt: EXPIRY, isActive: true, product: 'annual' },
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

  it('returns false without any event when aborted while GET me is pending', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ 'GET me': held });
    const controller = new AbortController();
    const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });

    const confirmation = result.current.confirm(PRODUCT, { signal: controller.signal });
    await waitFor(() => expect(requests).toHaveLength(1));
    controller.abort();
    await act(async () => {
      held.release(activeReply());
      await confirmation;
    });

    expect(queryClient.getQueryData(buildProStatusKey(fakeAuth.userId))).toEqual({
      expiresAt: EXPIRY,
      isPro: true,
      product: 'annual',
    });
    await expect(confirmation).resolves.toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('returns true and records one purchase_completed and one pro_purchased when not aborted', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ 'GET me': held });
    const controller = new AbortController();
    const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });

    const confirmation = result.current.confirm(PRODUCT, { signal: controller.signal });
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      held.release(activeReply());
      await confirmation;
    });

    await expect(confirmation).resolves.toBe(true);
    expect(jest.mocked(trackEvent).mock.calls).toEqual([
      ['purchase_completed', { productId: PRODUCT }],
      ['pro_purchased', { product: 'annual' }],
    ]);
  });
});
