import { randomUUID } from 'node:crypto';

import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { installRoutedFetch, type RouteReply } from '../../state/__tests__/authTestSupport';
import PurchaseCompleteScreen from '../purchase-complete';

// The purchase-complete route (B-38, Task 3.16): after Web Billing checkout,
// /purchase-complete?product=<productId> polls GET me immediately and then
// every 2 seconds for up to 30 seconds. It shows "Confirming your purchase"
// while polling, "Unlocked" once data.entitlements holds the product (polling
// stops), and "Still processing, check back shortly" after the deadline. A
// missing or invalid product, or a guest, makes no request at all.

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
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
const PRODUCT = 'syntactical.python.medium';
const OTHER_PRODUCT = 'syntactical.python.hard';
const POLL_INTERVAL_MS = 2000;
const DEADLINE_MS = 30_000;
const MAX_REQUESTS = DEADLINE_MS / POLL_INTERVAL_MS + 1;

function MenuStub() {
  return null;
}

const ROUTES = { index: MenuStub, 'purchase-complete': PurchaseCompleteScreen };

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

function urlFor(product: string | null): string {
  return product === null
    ? '/purchase-complete'
    : `/purchase-complete?product=${encodeURIComponent(product)}`;
}

// Lets pending promises (fetch, body read, state updates) settle without
// moving the fake clock.
async function flush(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// Moves the clock in 500 ms steps so every timer fires and every response
// settles before the next step.
async function advance(ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 500) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(500, ms - elapsed));
    });
    await flush();
  }
}

// The pending render carries getPathname; the settled one carries unmount,
// which is async in this testing-library version and must be awaited.
async function open(product: string | null): Promise<{ getPathname(): string; unmount(): Promise<void> }> {
  const pending = renderRouter(ROUTES, { initialUrl: urlFor(product) });
  const rendered = await pending;
  await flush();
  return { getPathname: () => pending.getPathname(), unmount: () => rendered.unmount() };
}

function meRequestCount(requests: { method: string; path: string }[]): number {
  return requests.filter((request) => request.method === 'GET' && request.path === 'me').length;
}

// role="heading" with aria-level 1, or accessibilityRole="header" (which
// native has no level for, so it counts as the page title), each counted once.
function listLevelOneHeadings(): unknown[] {
  const candidates = new Set(screen.queryAllByRole('header').concat(screen.queryAllByRole('heading')));
  return [...candidates].filter(
    (heading) =>
      heading.props['aria-level'] === 1 ||
      heading.props.accessibilityLevel === 1 ||
      (heading.props.accessibilityRole === 'header' && heading.props['aria-level'] === undefined),
  );
}

function findPoliteRegion(text: string) {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText(text);
  while (node) {
    if (node.props.accessibilityLiveRegion === 'polite' || node.props['aria-live'] === 'polite') {
      return node;
    }
    node = node.parent;
  }
  return null;
}

describe('purchase-complete route', () => {
  beforeEach(() => {
    mockUserId = randomUUID();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requests GET me immediately, then every 2 seconds, showing "Confirming your purchase" while polling', async () => {
    const { requests } = installRoutedFetch({ 'GET me': profileReply([]) });
    await open(PRODUCT);
    expect(screen.getByText(CONFIRMING)).toBeTruthy();
    expect(meRequestCount(requests)).toBe(1);
    expect(requests.every((request) => request.method === 'GET' && request.path === 'me')).toBe(true);

    await advance(POLL_INTERVAL_MS - 500);
    expect(meRequestCount(requests)).toBe(1);
    await advance(500);
    expect(meRequestCount(requests)).toBe(2);
    await advance(POLL_INTERVAL_MS);
    expect(meRequestCount(requests)).toBe(3);
    await advance(POLL_INTERVAL_MS);
    expect(meRequestCount(requests)).toBe(4);
    expect(screen.getByText(CONFIRMING)).toBeTruthy();
    expect(screen.queryByText(UNLOCKED)).toBeNull();
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();
  });

  it('shows "Unlocked" once data.entitlements includes the product and makes no further request', async () => {
    const { requests } = installRoutedFetch({
      'GET me': [profileReply([]), profileReply([OTHER_PRODUCT]), profileReply([OTHER_PRODUCT, PRODUCT])],
    });
    await open(PRODUCT);
    await advance(POLL_INTERVAL_MS * 2);
    expect(meRequestCount(requests)).toBe(3);
    expect(screen.getByText(UNLOCKED)).toBeTruthy();
    expect(screen.queryByText(CONFIRMING)).toBeNull();
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();

    await advance(DEADLINE_MS + 10_000);
    expect(meRequestCount(requests)).toBe(3);
    expect(screen.getByText(UNLOCKED)).toBeTruthy();
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();
  });

  it('does not unlock on a different product\'s entitlement', async () => {
    installRoutedFetch({ 'GET me': profileReply([OTHER_PRODUCT, `${PRODUCT}-extra`]) });
    await open(PRODUCT);
    await advance(POLL_INTERVAL_MS * 3);
    expect(screen.queryByText(UNLOCKED)).toBeNull();
    expect(screen.getByText(CONFIRMING)).toBeTruthy();
  });

  it('shows "Still processing, check back shortly" after 30 seconds without the entitlement and never requests after the deadline', async () => {
    const { requests } = installRoutedFetch({ 'GET me': profileReply([OTHER_PRODUCT]) });
    await open(PRODUCT);
    await advance(DEADLINE_MS - POLL_INTERVAL_MS);
    expect(screen.getByText(CONFIRMING)).toBeTruthy();
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();

    await advance(POLL_INTERVAL_MS);
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
    expect(screen.queryByText(CONFIRMING)).toBeNull();
    expect(screen.queryByText(UNLOCKED)).toBeNull();
    const countAtDeadline = meRequestCount(requests);
    expect(countAtDeadline).toBeGreaterThanOrEqual(MAX_REQUESTS - 1);
    expect(countAtDeadline).toBeLessThanOrEqual(MAX_REQUESTS);

    await advance(60_000);
    expect(meRequestCount(requests)).toBe(countAtDeadline);
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
  });

  it('keeps polling through a network error and a non-200 response, then unlocks', async () => {
    const { requests } = installRoutedFetch({
      'GET me': ['reject', { status: 500, body: { error: { code: 'INTERNAL', message: 'x' } } }, { status: 503 }, profileReply([PRODUCT])],
    });
    await open(PRODUCT);
    expect(screen.getByText(CONFIRMING)).toBeTruthy();
    await advance(POLL_INTERVAL_MS);
    expect(screen.getByText(CONFIRMING)).toBeTruthy();
    await advance(POLL_INTERVAL_MS * 2);
    expect(meRequestCount(requests)).toBe(4);
    expect(screen.getByText(UNLOCKED)).toBeTruthy();
  });

  it('keeps polling to the deadline when every request fails, then shows "Still processing, check back shortly"', async () => {
    const { requests } = installRoutedFetch({ 'GET me': ['reject', { status: 500 }] });
    await open(PRODUCT);
    await advance(DEADLINE_MS);
    expect(meRequestCount(requests)).toBeGreaterThanOrEqual(MAX_REQUESTS - 1);
    expect(meRequestCount(requests)).toBeLessThanOrEqual(MAX_REQUESTS);
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['a path escape', '../me'],
    ['another namespace', 'other.python.medium'],
    ['two segments', 'syntactical.python'],
    ['four segments', 'syntactical.python.medium.extra'],
    ['upper case', 'syntactical.Python.medium'],
    ['a query suffix', 'syntactical.python.medium?x=1'],
  ])('makes no request for a %s product and shows "Still processing, check back shortly"', async (_label, product) => {
    const { requests } = installRoutedFetch({ 'GET me': profileReply([PRODUCT]) });
    await open(product);
    await advance(DEADLINE_MS + POLL_INTERVAL_MS);
    expect(requests).toHaveLength(0);
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
    expect(screen.queryByText(UNLOCKED)).toBeNull();
    expect(screen.queryByText(CONFIRMING)).toBeNull();
  });

  it('makes no request for a guest and shows "Still processing, check back shortly"', async () => {
    mockUserId = null;
    const { requests } = installRoutedFetch({ 'GET me': profileReply([PRODUCT]) });
    await open(PRODUCT);
    await advance(DEADLINE_MS + POLL_INTERVAL_MS);
    expect(requests).toHaveLength(0);
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
    expect(screen.queryByText(UNLOCKED)).toBeNull();
  });

  it('stops polling on unmount', async () => {
    const { requests } = installRoutedFetch({ 'GET me': profileReply([]) });
    const rendered = await open(PRODUCT);
    await advance(POLL_INTERVAL_MS);
    expect(meRequestCount(requests)).toBe(2);
    await rendered.unmount();
    await advance(DEADLINE_MS);
    expect(meRequestCount(requests)).toBe(2);
  });

  it('has exactly one level-one header and announces the status in a polite live region', async () => {
    installRoutedFetch({ 'GET me': profileReply([]) });
    await open(PRODUCT);
    expect(listLevelOneHeadings()).toHaveLength(1);
    expect(findPoliteRegion(CONFIRMING)).not.toBeNull();

    await advance(DEADLINE_MS);
    expect(listLevelOneHeadings()).toHaveLength(1);
    expect(findPoliteRegion(STILL_PROCESSING)).not.toBeNull();
  });

  it('announces "Unlocked" in the polite live region', async () => {
    installRoutedFetch({ 'GET me': profileReply([PRODUCT]) });
    await open(PRODUCT);
    expect(findPoliteRegion(UNLOCKED)).not.toBeNull();
  });

  it('offers a link back to the menu that navigates home', async () => {
    installRoutedFetch({ 'GET me': profileReply([PRODUCT]) });
    const rendered = await open(PRODUCT);
    const link = screen.getByRole('link', { name: /menu/i });
    await fireEvent.press(link);
    await flush();
    expect(rendered.getPathname()).toBe('/');
  });
});
