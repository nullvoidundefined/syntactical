// The admin route on the web. The real AdminScreen, AuthProvider, StatsProvider, query client, and
// apiFetch/apiPut run in the DOM against a routed fetch stand-in:
// - the page has one h1, "Admin", and no element with a positive tabindex;
// - the one switch is reachable by keyboard (natively focusable or tabindex 0) and operable with
//   Space or Enter: one PUT admin/access { isGranted } goes out with the cookie credentials and the
//   CSRF header, and the switch shows the response;
// - "Pro (purchased)" is disabled, so a key press on it sends nothing.
// A browser activates a focused native checkbox on Space and a native button on Space or Enter by
// dispatching a click; jsdom does not, so pressKey dispatches that click for those elements when
// the key event was not cancelled. Any other element must handle the key itself.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
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
  ADMIN_GRANT_NAME,
  PROFILE_ROUTE,
  PURCHASED_NAME,
  buildEntry,
  entryReply,
  meReply,
} from './adminAccessTestSupport';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });

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
jest.mock('expo-router', () =>
  require('../../config/buildExpoRouterMock').buildExpoRouterMock({ readParams: () => ({}) }),
);

let queryClient: QueryClient;

type KeyName = ' ' | 'Enter';
const KEY_CODES: Record<KeyName, string> = { ' ': 'Space', Enter: 'Enter' };

async function renderSignedInAdmin(routes: Parameters<typeof installRoutedFetch>[0], name = ADMIN_GRANT_NAME) {
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
  await screen.findByRole('switch', { name });
  return { ...routed, rendered };
}

function readIsChecked(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) return element.checked;
  return element.getAttribute('aria-checked') === 'true';
}

function readIsDisabled(element: HTMLElement): boolean {
  return (element as HTMLInputElement).disabled === true || element.getAttribute('aria-disabled') === 'true';
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
  it('has one h1, "Admin", and no element with a positive tabindex', async () => {
    const { rendered } = await renderSignedInAdmin({ [ACCESS_ROUTE]: entryReply(buildEntry(null)) });
    const level1 = screen.getAllByRole('heading', { level: 1 });
    expect(level1).toHaveLength(1);
    expect(level1[0].textContent).toBe('Admin');
    const positive = Array.from(rendered.container.querySelectorAll<HTMLElement>('[tabindex]')).filter(
      (element) => Number(element.getAttribute('tabindex')) > 0,
    );
    expect(positive).toEqual([]);
  });

  it('grants by keyboard with one PUT { isGranted: true } carrying the CSRF header and cookie credentials', async () => {
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry('admin')),
    });
    const proSwitch = screen.getByRole('switch', { name: ADMIN_GRANT_NAME });
    expect(['BUTTON', 'INPUT'].includes(proSwitch.tagName) || proSwitch.getAttribute('tabindex') === '0').toBe(true);
    await operateByKeyboard(proSwitch, requests);
    await waitFor(() => expect(readIsChecked(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }))).toBe(true));
    const updates = listAccessUpdates(requests);
    expect(updates).toHaveLength(1);
    expect(updates[0].body).toEqual({ isGranted: true });
    expect(updates[0].headers['x-requested-with']).toBe('XMLHttpRequest');
    expect(updates[0].credentials).toBe('include');
  });

  it('revokes by keyboard with one PUT { isGranted: false }', async () => {
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: entryReply(buildEntry('admin')),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(null)),
    });
    await operateByKeyboard(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }), requests);
    await waitFor(() => expect(readIsChecked(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }))).toBe(false));
    expect(listAccessUpdates(requests).map(({ body }) => body)).toEqual([{ isGranted: false }]);
  });

  it('sends nothing for a key press on "Pro (purchased)", which stays checked and disabled', async () => {
    const { requests } = await renderSignedInAdmin(
      {
        [ACCESS_ROUTE]: entryReply(buildEntry('purchase')),
        [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry('admin')),
      },
      PURCHASED_NAME,
    );
    const purchased = screen.getByRole('switch', { name: PURCHASED_NAME });
    expect(readIsDisabled(purchased)).toBe(true);
    await pressKey(purchased, ' ');
    await pressKey(purchased, 'Enter');
    await settle();
    expect(listAccessUpdates(requests)).toHaveLength(0);
    expect(readIsChecked(screen.getByRole('switch', { name: PURCHASED_NAME }))).toBe(true);
  });
});
