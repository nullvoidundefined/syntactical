// purchase-complete records purchase_completed (IAN-601): once GET me says Pro is active the
// route sends one purchase_completed event carrying the product id, and while /me does not say
// so, it sends none, plus one pro_purchased with the plan.
import { randomUUID } from 'node:crypto';

import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { createQueryClient } from '../../config/queryClient';
import { installRoutedFetch, type RouteReply } from '../../state/__tests__/authTestSupport';
import PurchaseCompleteScreen from '../purchase-complete';
import { setExpoExtra } from '../../config/expoConstantsMock';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

const mockUserId = { current: randomUUID() };
jest.mock('../../state/AuthProvider', () => ({
  useAuth: () => ({
    completeGuestClaim: () => undefined,
    guestClaimUserId: null,
    isHydrated: true,
    isSignedIn: true,
    requestCode: () => Promise.resolve({ isOk: false, reason: 'unavailable' }),
    signOut: () => Promise.resolve(),
    user: { id: mockUserId.current },
    verifyCode: () => Promise.resolve({ isOk: false, reason: 'unavailable' }),
  }),
  useSignedInUserId: () => mockUserId.current,
}));

const mockTrackEvent = jest.fn();
jest.mock('../../clients/analyticsClient', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const UNLOCKED = "You're Pro";
const STILL_PROCESSING = 'Still processing, check back shortly';
const PRODUCT = 'syntactical.pro.annual';
const POLL_INTERVAL_MS = 2000;
const DEADLINE_MS = 30_000;

function MenuStub() {
  return null;
}

// The route confirms through the entitlements query, so the layout provides a query client.
function QueryLayout() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <Slot />
    </QueryClientProvider>
  );
}

const ROUTES = { _layout: QueryLayout, index: MenuStub, 'purchase-complete': PurchaseCompleteScreen };

function profileReply(isPro: boolean): RouteReply {
  const pro = isPro
    ? { expiresAt: '2027-10-27T12:00:00.000Z', isActive: true, product: 'annual' }
    : { expiresAt: null, isActive: false, product: null };
  return {
    status: 200,
    body: {
      data: {
        dailyGoal: 10,
        dayStreak: 0,
        email: 'reader@example.test',
        pro,
        timezone: null,
        xpToday: 0,
        xpTotal: 0,
      },
    },
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

async function open(product: string): Promise<void> {
  await renderRouter(ROUTES, {
    initialUrl: `/purchase-complete?product=${encodeURIComponent(product)}`,
  });
  await flush();
}

function listPurchaseCompletedCalls(): unknown[][] {
  return mockTrackEvent.mock.calls.filter(([name]) => name === 'purchase_completed');
}

describe('purchase-complete route analytics', () => {
  beforeEach(() => {
    mockUserId.current = randomUUID();
    mockTrackEvent.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('records purchase_completed with the product id exactly once when GET me lists the entitlement', async () => {
    installRoutedFetch({
      'GET me': [profileReply(false), profileReply(true)],
    });
    await open(PRODUCT);
    expect(listPurchaseCompletedCalls()).toHaveLength(0);

    await advance(POLL_INTERVAL_MS);
    expect(screen.getByText(UNLOCKED)).toBeTruthy();
    expect(listPurchaseCompletedCalls()).toEqual([['purchase_completed', { productId: PRODUCT }]]);
    expect(mockTrackEvent.mock.calls.filter(([name]) => name === 'pro_purchased')).toEqual([
      ['pro_purchased', { product: 'annual' }],
    ]);

    await advance(DEADLINE_MS + POLL_INTERVAL_MS);
    expect(listPurchaseCompletedCalls()).toHaveLength(1);
  });

  it('records no purchase_completed when GET me never lists the entitlement', async () => {
    installRoutedFetch({ 'GET me': profileReply(false) });
    await open(PRODUCT);
    await advance(DEADLINE_MS + POLL_INTERVAL_MS);
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
    expect(listPurchaseCompletedCalls()).toHaveLength(0);
  });
});
