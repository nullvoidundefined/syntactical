import { randomUUID } from 'node:crypto';

import { act, render, screen } from '@testing-library/react';

import { installRoutedFetch, type RouteReply } from '../../state/__tests__/authTestSupport';
import PurchaseCompleteScreen from '../purchase-complete';

// The purchase-complete route on the web (B-38, Task 3.16), where Web Billing
// checkout returns: GET me is polled with the session cookie immediately and
// every 2 seconds for up to 30 seconds; the page has one h1 element, the
// status sits in a role="status" polite live region, and a keyboard-focusable
// link leads back to the menu. A bad product or a guest makes no request.

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

// The query string the route was opened with.
let mockParams: Record<string, string | string[] | undefined> = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => mockParams,
  useGlobalSearchParams: () => mockParams,
}));

// Signed in unless a test sets this to null (a guest).
let mockUserId: string | null = null;
jest.mock('../../state/AuthProvider', () => ({
  useAuth: () => ({
    completeGuestClaim: () => undefined,
    guestClaimUserId: null,
    isHydrated: true,
    isSignedIn: mockUserId !== null,
    requestCode: () => Promise.resolve({ isOk: false, reason: 'unavailable' }),
    signOut: () => Promise.resolve(),
    user: mockUserId === null ? null : { id: mockUserId },
    verifyCode: () => Promise.resolve({ isOk: false, reason: 'unavailable' }),
  }),
}));

const CONFIRMING = 'Confirming your purchase';
const UNLOCKED = 'Unlocked';
const STILL_PROCESSING = 'Still processing, check back shortly';
const PRODUCT = 'syntactical.postgres.hard';
const POLL_INTERVAL_MS = 2000;
const DEADLINE_MS = 30_000;
const MAX_REQUESTS = DEADLINE_MS / POLL_INTERVAL_MS + 1;

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

async function open(product: string | string[] | undefined) {
  mockParams = product === undefined ? {} : { product };
  const rendered = render(<PurchaseCompleteScreen />);
  await flush();
  return rendered;
}

function meRequestCount(requests: { method: string; path: string }[]): number {
  return requests.filter((request) => request.method === 'GET' && request.path === 'me').length;
}

function readStatusRegion(): HTMLElement {
  const regions = screen.getAllByRole('status');
  expect(regions).toHaveLength(1);
  const [region] = regions;
  // role="status" is implicitly polite; an explicit aria-live must not override it.
  const live = region.getAttribute('aria-live');
  expect(live === null || live === 'polite').toBe(true);
  return region;
}

describe('purchase-complete route on the web', () => {
  beforeEach(() => {
    mockUserId = randomUUID();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls GET me with the session cookie immediately and every 2 seconds, announcing "Confirming your purchase"', async () => {
    const { requests } = installRoutedFetch({ 'GET me': profileReply([]) });
    await open(PRODUCT);
    expect(meRequestCount(requests)).toBe(1);
    expect(requests[0].credentials).toBe('include');
    expect(readStatusRegion().textContent).toContain(CONFIRMING);

    await advance(POLL_INTERVAL_MS - 500);
    expect(meRequestCount(requests)).toBe(1);
    await advance(500);
    expect(meRequestCount(requests)).toBe(2);
    await advance(POLL_INTERVAL_MS);
    expect(meRequestCount(requests)).toBe(3);
    expect(requests.every((request) => request.method === 'GET' && request.path === 'me')).toBe(true);
  });

  it('announces "Unlocked" once the entitlement appears and stops polling', async () => {
    const { requests } = installRoutedFetch({ 'GET me': [profileReply([]), profileReply([PRODUCT])] });
    await open(PRODUCT);
    await advance(POLL_INTERVAL_MS);
    expect(readStatusRegion().textContent).toContain(UNLOCKED);
    expect(screen.queryByText(CONFIRMING)).toBeNull();
    await advance(DEADLINE_MS);
    expect(meRequestCount(requests)).toBe(2);
  });

  it('announces "Still processing, check back shortly" at 30 seconds, polling through failures and never after the deadline', async () => {
    const { requests } = installRoutedFetch({ 'GET me': ['reject', { status: 502 }, profileReply([])] });
    await open(PRODUCT);
    await advance(DEADLINE_MS - POLL_INTERVAL_MS);
    expect(readStatusRegion().textContent).toContain(CONFIRMING);
    await advance(POLL_INTERVAL_MS);
    expect(readStatusRegion().textContent).toContain(STILL_PROCESSING);
    const countAtDeadline = meRequestCount(requests);
    expect(countAtDeadline).toBeGreaterThanOrEqual(MAX_REQUESTS - 1);
    expect(countAtDeadline).toBeLessThanOrEqual(MAX_REQUESTS);
    await advance(60_000);
    expect(meRequestCount(requests)).toBe(countAtDeadline);
  });

  it.each([
    ['missing', undefined],
    ['a path escape', '../me'],
    ['an absolute URL', 'https://evil.example.test/me'],
    ['another namespace', 'other.python.medium'],
    ['a repeated parameter', [PRODUCT, PRODUCT]],
  ])('makes no request for a %s product and announces "Still processing, check back shortly"', async (_label, product) => {
    const { requests } = installRoutedFetch({ 'GET me': profileReply([PRODUCT]) });
    await open(product);
    await advance(DEADLINE_MS + POLL_INTERVAL_MS);
    expect(requests).toHaveLength(0);
    expect(readStatusRegion().textContent).toContain(STILL_PROCESSING);
  });

  it('makes no request for a guest', async () => {
    mockUserId = null;
    const { requests } = installRoutedFetch({ 'GET me': profileReply([PRODUCT]) });
    await open(PRODUCT);
    await advance(DEADLINE_MS + POLL_INTERVAL_MS);
    expect(requests).toHaveLength(0);
    expect(readStatusRegion().textContent).toContain(STILL_PROCESSING);
  });

  it('stops polling on unmount', async () => {
    const { requests } = installRoutedFetch({ 'GET me': profileReply([]) });
    const { unmount } = await open(PRODUCT);
    await advance(POLL_INTERVAL_MS);
    expect(meRequestCount(requests)).toBe(2);
    unmount();
    await advance(DEADLINE_MS);
    expect(meRequestCount(requests)).toBe(2);
  });

  it('renders exactly one h1 element and a keyboard-focusable link back to the menu', async () => {
    installRoutedFetch({ 'GET me': profileReply([]) });
    await open(PRODUCT);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const link = screen.getByRole('link', { name: /menu/i });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/');
    expect(link.getAttribute('tabindex')).not.toBe('-1');
    link.focus();
    expect(document.activeElement).toBe(link);
  });
});
