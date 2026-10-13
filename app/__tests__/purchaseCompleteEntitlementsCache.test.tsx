import { randomUUID } from 'node:crypto';

import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { fakeAuth } from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import { installRoutedFetch, type RouteReply } from '../../state/__tests__/authTestSupport';
import { buildEntitlementsKey } from '../../state/useEntitlements';
import PurchaseCompleteScreen from '../purchase-complete';

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

const mockTrackEvent = jest.fn();
jest.mock('../../clients/analyticsClient', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const PRODUCT = 'syntactical.python.medium';
const OTHER_PRODUCT = 'syntactical.python.hard';
const POLL_INTERVAL_MS = 2000;
const DEADLINE_MS = 30_000;
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

function profileReply(entitlements: string[]): RouteReply {
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

describe('purchase-complete entitlements cache', () => {
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

  it('caches the unlocked product for the signed-in user and emits purchase_completed exactly once', async () => {
    installRoutedFetch({
      'GET me': [profileReply([OTHER_PRODUCT]), profileReply([OTHER_PRODUCT, PRODUCT])],
    });
    await open(PRODUCT);
    expect(screen.getByText('Confirming your purchase')).toBeTruthy();
    expect(queryClient.getQueryData(buildEntitlementsKey(userId)) ?? []).not.toEqual(expect.arrayContaining([PRODUCT]));
    expect(listPurchaseCompletedCalls()).toHaveLength(0);

    await advance(POLL_INTERVAL_MS);
    expect(screen.getByText('Unlocked')).toBeTruthy();
    expect(queryClient.getQueryData(buildEntitlementsKey(userId))).toEqual(expect.arrayContaining([PRODUCT]));
    expect(listPurchaseCompletedCalls()).toEqual([['purchase_completed', { productId: PRODUCT }]]);

    await advance(DEADLINE_MS + POLL_INTERVAL_MS);
    expect(listPurchaseCompletedCalls()).toHaveLength(1);
  });
});
