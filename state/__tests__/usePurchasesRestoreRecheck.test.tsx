// usePurchases restore while the RevenueCat TRANSFER webhook is still on its way: the store's
// restore returns before the server has moved Pro to this account, so a GET me that says free is
// re-checked after a short wait, the same count and wait the Pro offer uses for a pending purchase,
// before restore resolves false. The wait is faked here so the suite takes no real time.
import { randomUUID } from 'node:crypto';
import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { restoreStorePurchases } from '../../clients/purchaseStoreClient';
import { fakeAuth } from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { usePurchases } from '../usePurchases';
import { buildProStatusKey } from '../useProStatus';
import { PRO_RECHECK_COUNT, waitForProRecheck } from '../waitForProRecheck';

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
jest.mock('../waitForProRecheck', () => ({
  ...jest.requireActual('../waitForProRecheck'),
  waitForProRecheck: jest.fn(() => Promise.resolve()),
}));

let queryClient: ReturnType<typeof createQueryClient>;

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function meReply(pro: { expiresAt: string | null; isActive: boolean; product: string | null }): FakeReply {
  return { status: 200, body: { data: { dailyGoal: 20, dayStreak: 0, pro, xpToday: 0, xpTotal: 0 } } };
}

const FREE = meReply({ expiresAt: null, isActive: false, product: null });
const ACTIVE_LIFETIME = meReply({ expiresAt: null, isActive: true, product: 'lifetime' });

async function restore(): Promise<boolean | Error> {
  const { result } = await renderHook(() => usePurchases(), { wrapper: QueryWrapper });
  let outcome: boolean | Error = new Error('restore did not settle');
  await act(async () => {
    outcome = await result.current.restore().catch((error: Error) => error);
  });
  return outcome;
}

beforeEach(() => {
  fakeAuth.userId = randomUUID();
  queryClient = createQueryClient();
  jest.mocked(restoreStorePurchases).mockReset();
  jest.mocked(restoreStorePurchases).mockResolvedValue(true);
  jest.mocked(waitForProRecheck).mockClear();
});

afterEach(() => {
  queryClient.clear();
});

describe('usePurchases restore re-checks GET me', () => {
  it('re-checks after a wait and is true once the transfer reaches the server', async () => {
    const { requests } = installRoutedFetch({ 'GET me': [FREE, ACTIVE_LIFETIME] });

    expect(await restore()).toBe(true);

    expect(waitForProRecheck).toHaveBeenCalledTimes(1);
    expect(requests.filter(({ path }) => path === 'me')).toHaveLength(2);
    expect(queryClient.getQueryData(buildProStatusKey(fakeAuth.userId))).toMatchObject({ product: 'lifetime' });
  });

  it('is false only after every re-check still says free', async () => {
    expect(PRO_RECHECK_COUNT).toBeGreaterThan(0);
    const { requests } = installRoutedFetch({ 'GET me': FREE });

    expect(await restore()).toBe(false);

    expect(waitForProRecheck).toHaveBeenCalledTimes(PRO_RECHECK_COUNT);
    expect(requests.filter(({ path }) => path === 'me')).toHaveLength(1 + PRO_RECHECK_COUNT);
  });

  it('does not wait when the first GET me already says Pro', async () => {
    installRoutedFetch({ 'GET me': ACTIVE_LIFETIME });

    expect(await restore()).toBe(true);

    expect(waitForProRecheck).not.toHaveBeenCalled();
  });

  it('rejects when a re-check of GET me fails', async () => {
    installRoutedFetch({ 'GET me': [FREE, 'reject'] });

    expect(await restore()).toBeInstanceOf(Error);
  });
});
