import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Slot } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { AUTH_STORAGE_KEY } from '../../constants/appConfig';
import { AuthProvider } from '../../state/AuthProvider';
import { installRoutedFetch, type RouteReply } from '../../state/__tests__/authTestSupport';
import PurchaseCompleteScreen from '../purchase-complete';

// /purchase-complete after a full page load (B-38c): checkout returns to a
// fresh app, so the real AuthProvider has not yet read the stored identity
// when the route first renders. Until hydration finishes the route makes no
// request and never shows "Still processing, check back shortly" (that verdict
// is for a guest or a timed-out poll, not for "not read yet"); once a stored
// signed-in user is hydrated it polls GET me at once and every 2 seconds, and
// once a stored guest is hydrated it shows "Still processing, check back
// shortly" and makes no request.

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

const CONFIRMING = 'Confirming your purchase';
const UNLOCKED = 'Unlocked';
const STILL_PROCESSING = 'Still processing, check back shortly';
const PRODUCT = 'syntactical.python.medium';
const POLL_INTERVAL_MS = 2000;

function AuthLayout() {
  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}

function MenuStub() {
  return null;
}

const ROUTES = { _layout: AuthLayout, index: MenuStub, 'purchase-complete': PurchaseCompleteScreen };

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

// The AsyncStorage stand-in's own getItem, kept so each test can restore it.
const getItemMock = AsyncStorage.getItem as jest.Mock;
const realGetItem = getItemMock.getMockImplementation() as (key: string) => Promise<string | null>;

// Holds the AsyncStorage read of the stored identity until release(), so the
// test can observe the route before AuthProvider has hydrated.
function holdIdentityRead(): { release(): Promise<void> } {
  let releaseRead: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  getItemMock.mockImplementation(async (key: string) => {
    if (key === AUTH_STORAGE_KEY) await gate;
    return realGetItem(key);
  });
  return {
    release: async () => {
      releaseRead();
      await flush();
    },
  };
}

async function flush(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
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

async function open(): Promise<void> {
  await renderRouter(ROUTES, { initialUrl: `/purchase-complete?product=${encodeURIComponent(PRODUCT)}` });
  await flush();
}

function meRequestCount(requests: { method: string; path: string }[]): number {
  return requests.filter((request) => request.method === 'GET' && request.path === 'me').length;
}

describe('purchase-complete route before AuthProvider hydrates', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });

  afterEach(() => {
    getItemMock.mockImplementation(realGetItem);
    jest.useRealTimers();
  });

  it('waits for a stored signed-in user to hydrate, without showing "Still processing", then polls GET me and unlocks', async () => {
    const userId = randomUUID();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
    const hydration = holdIdentityRead();
    const { requests } = installRoutedFetch({ 'GET me': [profileReply([]), profileReply([PRODUCT])] });

    await open();
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();
    expect(screen.queryByText(UNLOCKED)).toBeNull();
    expect(meRequestCount(requests)).toBe(0);

    await advance(1000);
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();
    expect(meRequestCount(requests)).toBe(0);

    await hydration.release();
    expect(meRequestCount(requests)).toBe(1);
    expect(screen.getByText(CONFIRMING)).toBeTruthy();
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();

    await advance(POLL_INTERVAL_MS);
    expect(meRequestCount(requests)).toBe(2);
    expect(screen.getByText(UNLOCKED)).toBeTruthy();
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();
  });

  it('does not show "Still processing" before hydration, then shows it with no request once a stored guest is hydrated', async () => {
    const knownUserId = randomUUID();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [knownUserId], userId: null }));
    const hydration = holdIdentityRead();
    const { requests } = installRoutedFetch({ 'GET me': profileReply([PRODUCT]) });

    await open();
    expect(screen.queryByText(STILL_PROCESSING)).toBeNull();

    await hydration.release();
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
    expect(screen.queryByText(UNLOCKED)).toBeNull();

    await advance(POLL_INTERVAL_MS * 2);
    expect(requests).toHaveLength(0);
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
  });
});
