// The admin route, app/admin.tsx, on the web (IAN-601). The real AdminScreen, ContentProvider (the
// bundled manifest), AuthProvider, StatsProvider, query client, and apiFetch/apiPut run in the DOM
// against a routed fetch stand-in:
// - the page has one h1, "Admin", and no element with a positive tabindex;
// - every switch is reachable by keyboard (natively focusable or tabindex 0) and operable with
//   Space or Enter: one PUT admin/access goes out, with the cookie credentials and the CSRF header,
//   and the switch shows the response;
// - a purchased product's switch is disabled, so a key press on it sends nothing.
// A browser activates a focused native checkbox on Space and a native button on Space or Enter by
// dispatching a click; jsdom does not, so pressKey dispatches that click for those elements when
// the key event was not cancelled. Any other element must handle the key itself.
// Identities are built at run time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { createQueryClient } from '../../config/queryClient';
import {
  AUTH_STORAGE_KEY,
  buildIdentity,
  installRoutedFetch,
  type RoutedRequest,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider } from '../../state/AuthProvider';
import { ContentProvider } from '../../state/ContentProvider';
import { OwnedStatsProvider } from '../../state/OwnedStatsProvider';
import AdminScreen from '../admin';

import {
  ACCESS_PATH,
  ACCESS_ROUTE,
  ACCESS_UPDATE_ROUTE,
  JAVASCRIPT_MEDIUM_NAME,
  POSTGRES_HARD,
  POSTGRES_HARD_NAME,
  PROFILE_ROUTE,
  PYTHON_MEDIUM,
  PYTHON_MEDIUM_NAME,
  accessReply,
  buildEntry,
  entryReply,
  meReply,
  mixedProducts,
} from './adminAccessTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../state/SyncProvider', () => ({
  useSync: () => ({
    cancelPass: () => undefined,
    isSyncing: false,
    isUploadCapReached: false,
    syncNow: () => Promise.resolve(true),
  }),
}));
jest.mock('../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('@react-native-community/netinfo', () => {
  const api = {
    addEventListener: (listener: (value: { isConnected: boolean }) => void) => {
      listener({ isConnected: true });
      return () => undefined;
    },
    fetch: () => Promise.resolve({ isConnected: true }),
  };
  return { __esModule: true, default: api, ...api };
});
jest.mock('expo-router', () => {
  const router = {
    back: () => undefined,
    dismissTo: () => undefined,
    navigate: () => undefined,
    push: () => undefined,
    replace: () => undefined,
  };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useGlobalSearchParams: () => ({}),
    useLocalSearchParams: () => ({}),
    useRouter: () => router,
  };
});

let queryClient: QueryClient;

type KeyName = ' ' | 'Enter';
const KEY_CODES: Record<KeyName, string> = { ' ': 'Space', Enter: 'Enter' };

async function renderSignedInAdmin(routes: Parameters<typeof installRoutedFetch>[0]) {
  const identity = buildIdentity();
  const routed = installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }), ...routes });
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <ContentProvider contentBaseUrl={null}>
        <AuthProvider>
          <OwnedStatsProvider>
            <AdminScreen />
          </OwnedStatsProvider>
        </AuthProvider>
      </ContentProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME });
  return { ...routed, rendered };
}

function getSwitch(name: RegExp): HTMLElement {
  return screen.getByRole('switch', { name });
}

function readIsChecked(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) return element.checked;
  return element.getAttribute('aria-checked') === 'true';
}

function readIsDisabled(element: HTMLElement): boolean {
  return (element as HTMLInputElement).disabled === true || element.getAttribute('aria-disabled') === 'true';
}

function isNativelyFocusable(element: HTMLElement): boolean {
  return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

function readsAsNativeActivation(element: HTMLElement, key: KeyName): boolean {
  if (element instanceof HTMLInputElement && element.type === 'checkbox') return key === ' ';
  return element instanceof HTMLButtonElement;
}

async function pressKey(element: HTMLElement, key: KeyName): Promise<void> {
  await act(async () => {
    element.focus();
    const code = KEY_CODES[key];
    const isNotCancelled = fireEvent.keyDown(element, { code, key });
    fireEvent.keyUp(element, { code, key });
    if (isNotCancelled && readsAsNativeActivation(element, key) && !readIsDisabled(element)) fireEvent.click(element);
  });
}

function listAccessUpdates(requests: RoutedRequest[]): RoutedRequest[] {
  return requests.filter(({ method, path }) => method === 'PUT' && path === ACCESS_PATH);
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

// Space first; Enter only when Space sent nothing, so a switch that answers either key sends one PUT.
async function operateByKeyboard(element: HTMLElement, requests: RoutedRequest[]): Promise<void> {
  const before = listAccessUpdates(requests).length;
  await pressKey(element, ' ');
  await settle();
  if (listAccessUpdates(requests).length === before) {
    await pressKey(element, 'Enter');
    await settle();
  }
}

beforeEach(async () => {
  await AsyncStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  queryClient = createQueryClient();
});

afterEach(async () => {
  await settle();
  queryClient.clear();
});

describe('admin route on the web', () => {
  it('has one h1, "Admin"', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: accessReply(mixedProducts()) });
    const level1 = screen.getAllByRole('heading', { level: 1 });
    expect(level1).toHaveLength(1);
    expect(level1[0].textContent).toBe('Admin');
  });

  it('has no element with a positive tabindex', async () => {
    const { rendered } = await renderSignedInAdmin({ [ACCESS_ROUTE]: accessReply(mixedProducts()) });
    const positive = Array.from(rendered.container.querySelectorAll<HTMLElement>('[tabindex]')).filter(
      (element) => Number(element.getAttribute('tabindex')) > 0,
    );
    expect(positive).toEqual([]);
  });

  it('draws each switch as a track and thumb whose state follows aria-checked, still role switch', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: accessReply(mixedProducts()) });
    const off = getSwitch(PYTHON_MEDIUM_NAME);
    const on = getSwitch(POSTGRES_HARD_NAME);
    expect(within(off).getByTestId('switch-track-off')).toBeTruthy();
    expect(within(off).getByTestId('switch-thumb-off')).toBeTruthy();
    expect(within(off).queryByTestId('switch-track-on')).toBeNull();
    expect(within(on).getByTestId('switch-track-on')).toBeTruthy();
    expect(within(on).getByTestId('switch-thumb-on')).toBeTruthy();
    expect(within(on).queryByTestId('switch-track-off')).toBeNull();
  });

  it('draws a purchased switch as an on track that is disabled, beside the Purchased text', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: accessReply(mixedProducts()) });
    const purchased = getSwitch(JAVASCRIPT_MEDIUM_NAME);
    expect(within(purchased).getByTestId('switch-track-on')).toBeTruthy();
    expect(readIsDisabled(purchased)).toBe(true);
    expect(screen.getByText('Purchased')).toBeTruthy();
  });

  it('makes every switch an element the keyboard reaches', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: accessReply(mixedProducts()) });
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(3);
    for (const element of switches.filter((candidate) => !readIsDisabled(candidate))) {
      expect(isNativelyFocusable(element) || element.getAttribute('tabindex') === '0').toBe(true);
      element.focus();
      expect(document.activeElement).toBe(element);
    }
  });

  it('grants by keyboard with one PUT carrying the CSRF header and cookie credentials, then checked', async () => {
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(PYTHON_MEDIUM, 'admin')),
    });
    expect(readIsChecked(getSwitch(PYTHON_MEDIUM_NAME))).toBe(false);
    await operateByKeyboard(getSwitch(PYTHON_MEDIUM_NAME), requests);
    await waitFor(() => expect(readIsChecked(getSwitch(PYTHON_MEDIUM_NAME))).toBe(true));
    const updates = listAccessUpdates(requests);
    expect(updates).toHaveLength(1);
    expect(updates[0].body).toEqual({ isGranted: true, productId: PYTHON_MEDIUM });
    expect(updates[0].headers['x-requested-with']).toBe('XMLHttpRequest');
    expect(updates[0].credentials).toBe('include');
  });

  it('revokes by keyboard with one PUT, then unchecked', async () => {
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(POSTGRES_HARD, null)),
    });
    await operateByKeyboard(getSwitch(POSTGRES_HARD_NAME), requests);
    await waitFor(() => expect(readIsChecked(getSwitch(POSTGRES_HARD_NAME))).toBe(false));
    const updates = listAccessUpdates(requests);
    expect(updates).toHaveLength(1);
    expect(updates[0].body).toEqual({ isGranted: false, productId: POSTGRES_HARD });
  });

  it('sends nothing for a key press on a purchased product, which stays checked and disabled', async () => {
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(PYTHON_MEDIUM, 'admin')),
    });
    const purchased = getSwitch(JAVASCRIPT_MEDIUM_NAME);
    expect(readIsDisabled(purchased)).toBe(true);
    await pressKey(purchased, ' ');
    await pressKey(purchased, 'Enter');
    await settle();
    expect(listAccessUpdates(requests)).toHaveLength(0);
    expect(readIsChecked(getSwitch(JAVASCRIPT_MEDIUM_NAME))).toBe(true);
  });
});
