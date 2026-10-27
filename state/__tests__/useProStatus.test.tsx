// state/__tests__/useProStatus.test.tsx
// useProStatus reads data.pro from GET me under the ['me', userId, 'pro'] key: a guest makes no
// request; a free user, an annual subscriber, and a lifetime owner read as ready with the server's
// values; a reply without a well-formed pro object is an error whose retry asks again; and
// invalidating ['me'] (what useAdminAccess does after a change) refetches it.
import { randomUUID } from 'node:crypto';
import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { fakeAuth } from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { buildProStatusKey, useProStatus } from '../useProStatus';

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

// Noon UTC, so the date is the same in every time zone a CI runner uses.
const ANNUAL_EXPIRY = '2027-10-27T12:00:00.000Z';
const FREE = { expiresAt: null, isActive: false, product: null };
const ANNUAL = { expiresAt: ANNUAL_EXPIRY, isActive: true, product: 'annual' };
const LIFETIME = { expiresAt: null, isActive: true, product: 'lifetime' };

let queryClient: ReturnType<typeof createQueryClient>;

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function meReply(pro: unknown): FakeReply {
  return {
    status: 200,
    body: { data: { dailyGoal: 20, dayStreak: 0, email: 'reader@example.test', pro, xpToday: 0, xpTotal: 0 } },
  };
}

beforeEach(() => {
  fakeAuth.userId = randomUUID();
  queryClient = createQueryClient();
});

afterEach(() => {
  queryClient.clear();
});

describe('useProStatus', () => {
  it('is guest for a guest and sends no request', async () => {
    fakeAuth.userId = null;
    const { requests } = installRoutedFetch({ 'GET me': meReply(ANNUAL) });
    const { result } = await renderHook(() => useProStatus(), { wrapper: QueryWrapper });
    expect(result.current).toEqual({ status: 'guest' });
    expect(requests).toHaveLength(0);
  });

  it.each([
    ['a free user', FREE, { expiresAt: null, isPro: false, product: null, status: 'ready' }],
    ['an annual subscriber', ANNUAL, { expiresAt: ANNUAL_EXPIRY, isPro: true, product: 'annual', status: 'ready' }],
    ['a lifetime owner', LIFETIME, { expiresAt: null, isPro: true, product: 'lifetime', status: 'ready' }],
  ])('reads %s from data.pro', async (_label, pro, expected) => {
    installRoutedFetch({ 'GET me': meReply(pro) });
    const { result } = await renderHook(() => useProStatus(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current).toEqual(expected));
  });

  it("caches the status under ['me', userId, 'pro']", async () => {
    installRoutedFetch({ 'GET me': meReply(ANNUAL) });
    const { result } = await renderHook(() => useProStatus(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(buildProStatusKey(fakeAuth.userId)).toEqual(['me', fakeAuth.userId, 'pro']);
    expect(queryClient.getQueryData(buildProStatusKey(fakeAuth.userId))).toEqual({
      expiresAt: ANNUAL_EXPIRY,
      isPro: true,
      product: 'annual',
    });
  });

  it.each([
    ['the old entitlements shape', { status: 200, body: { data: { entitlements: [] } } }],
    ['a non-boolean isActive', meReply({ ...FREE, isActive: 'false' })],
    ['an unknown product', meReply({ ...ANNUAL, product: 'monthly' })],
    ['an expiry that is not a date', meReply({ ...ANNUAL, expiresAt: 'soon' })],
    ['a 503', { status: 503 }],
  ])('is an error for %s', async (_label, reply) => {
    installRoutedFetch({ 'GET me': reply as FakeReply });
    const { result } = await renderHook(() => useProStatus(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('asks again on retry after an error', async () => {
    const { setRoute } = installRoutedFetch({ 'GET me': { status: 503 } });
    const { result } = await renderHook(() => useProStatus(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    setRoute('GET me', meReply(LIFETIME));
    await act(async () => {
      if (result.current.status === 'error') result.current.retry();
    });
    await waitFor(() => expect(result.current).toMatchObject({ isPro: true, product: 'lifetime', status: 'ready' }));
  });

  it("refetches when the ['me'] queries are invalidated, as an admin change does", async () => {
    const { setRoute } = installRoutedFetch({ 'GET me': meReply(FREE) });
    const { result } = await renderHook(() => useProStatus(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current).toMatchObject({ isPro: false, status: 'ready' }));
    setRoute('GET me', meReply(LIFETIME));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    });
    await waitFor(() => expect(result.current).toMatchObject({ isPro: true, product: 'lifetime' }));
  });
});
