// state/__tests__/usePurchasesPro.test.tsx
// usePurchases against GET me's pro object: confirm resolves true only when pro.isActive is true,
// records purchase_completed with the product id and pro_purchased with the plan, and leaves the
// refetched status in the useProStatus cache; buy hands the product id to the store, then confirms
// on native ('unlocked' or 'pending'), and passes a cancelled or unavailable store result through;
// restore is true only when GET me then says Pro, false when it says free, and rejects when the
// store or GET me failed.
import { randomUUID } from 'node:crypto';
import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { trackEvent } from '../../clients/analyticsClient';
import { buyStoreProduct, restoreStorePurchases } from '../../clients/purchaseStoreClient';
import { fakeAuth } from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { usePurchases } from '../usePurchases';
import { buildProStatusKey } from '../useProStatus';

import { installRoutedFetch, type FakeReply } from './authTestSupport';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
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

const ANNUAL = 'syntactical.pro.annual';
const LIFETIME = 'syntactical.pro.lifetime';
const EXPIRY = '2027-10-27T12:00:00.000Z';

let queryClient: ReturnType<typeof createQueryClient>;

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function meReply(pro: { expiresAt: string | null; isActive: boolean; product: string | null }): FakeReply {
  return { status: 200, body: { data: { dailyGoal: 20, dayStreak: 0, pro, xpToday: 0, xpTotal: 0 } } };
}

const FREE = meReply({ expiresAt: null, isActive: false, product: null });
const ACTIVE_ANNUAL = meReply({ expiresAt: EXPIRY, isActive: true, product: 'annual' });
const ACTIVE_LIFETIME = meReply({ expiresAt: null, isActive: true, product: 'lifetime' });

async function renderPurchases() {
  const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });
  return result;
}

beforeEach(() => {
  fakeAuth.userId = randomUUID();
  queryClient = createQueryClient();
  jest.mocked(trackEvent).mockReset();
  jest.mocked(buyStoreProduct).mockReset();
  jest.mocked(restoreStorePurchases).mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe('usePurchases confirm', () => {
  it.each([
    [ANNUAL, ACTIVE_ANNUAL, 'annual'],
    [LIFETIME, ACTIVE_LIFETIME, 'lifetime'],
    ['syntactical.pro.annual:yearly', ACTIVE_ANNUAL, 'annual'],
  ])('resolves true for %s once GET me says Pro is active, with both events', async (productId, reply, plan) => {
    installRoutedFetch({ 'GET me': reply });
    const result = await renderPurchases();
    let confirmed: boolean | undefined;
    await act(async () => {
      confirmed = await result.current.confirm(productId);
    });
    expect(confirmed).toBe(true);
    expect(jest.mocked(trackEvent).mock.calls).toEqual([
      ['purchase_completed', { productId }],
      ['pro_purchased', { product: plan }],
    ]);
    expect(queryClient.getQueryData(buildProStatusKey(fakeAuth.userId))).toMatchObject({ isPro: true });
  });

  it('resolves false with no event while GET me says Pro is not active', async () => {
    installRoutedFetch({ 'GET me': FREE });
    const result = await renderPurchases();
    let confirmed: boolean | undefined;
    await act(async () => {
      confirmed = await result.current.confirm(ANNUAL);
    });
    expect(confirmed).toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('resolves false with no event when GET me fails', async () => {
    installRoutedFetch({ 'GET me': 'reject' });
    const result = await renderPurchases();
    let confirmed: boolean | undefined;
    await act(async () => {
      confirmed = await result.current.confirm(ANNUAL);
    });
    expect(confirmed).toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('records purchase_completed but no pro_purchased for a product id that is not Pro', async () => {
    installRoutedFetch({ 'GET me': ACTIVE_LIFETIME });
    const result = await renderPurchases();
    await act(async () => {
      await result.current.confirm('syntactical.python.medium');
    });
    expect(jest.mocked(trackEvent).mock.calls).toEqual([
      ['purchase_completed', { productId: 'syntactical.python.medium' }],
    ]);
  });
});

describe('usePurchases buy and restore', () => {
  it('hands the product id to the store and reports unlocked once GET me says Pro', async () => {
    jest.mocked(buyStoreProduct).mockResolvedValueOnce('purchased');
    installRoutedFetch({ 'GET me': ACTIVE_ANNUAL });
    const result = await renderPurchases();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.buy(ANNUAL);
    });
    expect(jest.mocked(buyStoreProduct).mock.calls[0][0]).toBe(ANNUAL);
    expect(outcome).toBe('unlocked');
  });

  it('reports pending when the store finished but GET me does not say Pro yet', async () => {
    jest.mocked(buyStoreProduct).mockResolvedValueOnce('purchased');
    installRoutedFetch({ 'GET me': FREE });
    const result = await renderPurchases();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.buy(LIFETIME);
    });
    expect(outcome).toBe('pending');
  });

  it.each(['cancelled', 'unavailable'] as const)(
    'passes a %s store result through without asking GET me',
    async (store) => {
      jest.mocked(buyStoreProduct).mockResolvedValueOnce(store);
      const { requests } = installRoutedFetch({ 'GET me': ACTIVE_ANNUAL });
      const result = await renderPurchases();
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.buy(ANNUAL);
      });
      expect(outcome).toBe(store);
      expect(requests).toHaveLength(0);
    },
  );

  it('restore is true when the store restored and GET me then says Pro', async () => {
    jest.mocked(restoreStorePurchases).mockResolvedValue(true);
    installRoutedFetch({ 'GET me': ACTIVE_LIFETIME });
    const result = await renderPurchases();
    let restored: boolean | undefined;
    await act(async () => {
      restored = await result.current.restore();
    });
    expect(restored).toBe(true);
    expect(queryClient.getQueryData(buildProStatusKey(fakeAuth.userId))).toMatchObject({ product: 'lifetime' });
  });

  it('restore is false when the store restored but GET me says this account is not Pro', async () => {
    jest.mocked(restoreStorePurchases).mockResolvedValue(true);
    installRoutedFetch({ 'GET me': FREE });
    const result = await renderPurchases();
    let restored: boolean | undefined;
    await act(async () => {
      restored = await result.current.restore();
    });
    expect(restored).toBe(false);
    expect(queryClient.getQueryData(buildProStatusKey(fakeAuth.userId))).toMatchObject({ isPro: false });
  });

  it('restore rejects when the store restore fails, without asking GET me', async () => {
    jest.mocked(restoreStorePurchases).mockResolvedValue(false);
    const { requests } = installRoutedFetch({ 'GET me': ACTIVE_LIFETIME });
    const result = await renderPurchases();
    let failure: unknown;
    await act(async () => {
      failure = await result.current.restore().then(
        () => null,
        (error: unknown) => error,
      );
    });
    expect(failure).toBeInstanceOf(Error);
    expect(requests).toHaveLength(0);
  });

  it('restore rejects when GET me fails after the store restored', async () => {
    jest.mocked(restoreStorePurchases).mockResolvedValue(true);
    installRoutedFetch({ 'GET me': 'reject' });
    const result = await renderPurchases();
    let failure: unknown;
    await act(async () => {
      failure = await result.current.restore().then(
        () => null,
        (error: unknown) => error,
      );
    });
    expect(failure).toBeInstanceOf(Error);
  });
});
