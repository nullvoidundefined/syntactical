// purchase-complete and the Pro status cache: a route that remounts while the first GET me is
// pending sends no second request and records one purchase_completed once it answers; and the
// confirmed status is left in the useProStatus cache for the signed-in user, with
// purchase_completed and pro_purchased recorded exactly once.
import { randomUUID } from 'node:crypto';

import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { fakeAuth } from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { holdReply, installRoutedFetch, type RouteReply } from '../../state/__tests__/authTestSupport';
import { buildProStatusKey } from '../../state/useProStatus';
import PurchaseCompleteScreen from '../purchase-complete';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../state/AuthProvider', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);

const mockTrackEvent = jest.fn();
jest.mock('../../clients/analyticsClient', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const PRODUCT = 'syntactical.pro.lifetime';
const POLL_INTERVAL_MS = 2000;
const DEADLINE_MS = 30_000;
const UNLOCKED = 'Unlocked';
let queryClient: ReturnType<typeof createQueryClient>;
let userId: string;

function MenuStub() {
  return null;
}

function QueryLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  );
}

const ROUTES = { _layout: QueryLayout, index: MenuStub, 'purchase-complete': PurchaseCompleteScreen };

function profileReply(isPro: boolean): RouteReply {
  const pro = isPro
    ? { expiresAt: null, isActive: true, product: 'lifetime' }
    : { expiresAt: null, isActive: false, product: null };
  return {
    status: 200,
    body: { data: { dailyGoal: 10, dayStreak: 0, email: 'reader@example.test', pro, timezone: null, xpToday: 0 } },
  };
}

async function flush(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function advance(ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 500) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(500, ms - elapsed));
    });
    await flush();
  }
}

async function open(product: string): Promise<{ unmount(): Promise<void> }> {
  const rendered = await renderRouter(ROUTES, {
    initialUrl: `/purchase-complete?product=${encodeURIComponent(product)}`,
  });
  await flush();
  return { unmount: () => rendered.unmount() };
}

function listEvents(name: string): unknown[][] {
  return mockTrackEvent.mock.calls.filter(([event]) => event === name);
}

describe('purchase-complete Pro status cache', () => {
  beforeEach(() => {
    userId = randomUUID();
    fakeAuth.userId = userId;
    queryClient = createQueryClient();
    mockTrackEvent.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    queryClient.clear();
    jest.useRealTimers();
  });

  it('records one purchase_completed when the route remounts while the first GET me is pending', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ 'GET me': [held, profileReply(true)] });
    const first = await open(PRODUCT);
    expect(screen.getByText('Confirming your purchase')).toBeTruthy();
    expect(requests.filter(({ method, path }) => method === 'GET' && path === 'me')).toHaveLength(1);

    await first.unmount();
    await open(PRODUCT);
    expect(screen.getByText('Confirming your purchase')).toBeTruthy();
    expect(requests.filter(({ method, path }) => method === 'GET' && path === 'me')).toHaveLength(1);
    expect(listEvents('purchase_completed')).toHaveLength(0);

    held.release(profileReply(true) as Parameters<typeof held.release>[0]);
    await flush();

    expect(screen.getByText(UNLOCKED)).toBeTruthy();
    expect(listEvents('purchase_completed')).toHaveLength(1);
  });

  it('leaves the confirmed Pro status in the cache and records each purchase event once', async () => {
    installRoutedFetch({ 'GET me': [profileReply(false), profileReply(true)] });
    await open(PRODUCT);
    expect(screen.getByText('Confirming your purchase')).toBeTruthy();
    expect(queryClient.getQueryData(buildProStatusKey(userId))).toMatchObject({ isPro: false });

    await advance(POLL_INTERVAL_MS);
    expect(screen.getByText(UNLOCKED)).toBeTruthy();
    expect(queryClient.getQueryData(buildProStatusKey(userId))).toEqual({
      expiresAt: null,
      isPro: true,
      product: 'lifetime',
    });
    expect(listEvents('purchase_completed')).toEqual([['purchase_completed', { productId: PRODUCT }]]);
    expect(listEvents('pro_purchased')).toEqual([['pro_purchased', { product: 'lifetime' }]]);

    await advance(DEADLINE_MS + POLL_INTERVAL_MS);
    expect(listEvents('purchase_completed')).toHaveLength(1);
    expect(listEvents('pro_purchased')).toHaveLength(1);
  });
});
