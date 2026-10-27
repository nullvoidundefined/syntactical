// The admin route's load and failure states on native, with the real AdminScreen, AuthProvider,
// query client, and apiFetch/apiPut against a routed fetch stand-in:
// - the access entry is fetched again each time the page is opened;
// - only a 401 or 403 shows "not available"; any other failed load shows a load-failed state with
//   a Retry button that fetches again;
// - every state (loading, not available, load failed, ready) renders the one h1 "Admin";
// - a failed change's alert clears when the next change succeeds;
// - signing out removes the cached access entry;
// - before the stored sign-in is read, the page shows the loading state, not "not available".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import {
  AUTH_STORAGE_KEY,
  SESSION_TOKEN_KEY,
  buildIdentity,
  holdReply,
  installRoutedFetch,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { AdminCacheReset } from '../../state/AdminCacheReset';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
import { ContentProvider } from '../../state/ContentProvider';
import { OwnedStatsProvider } from '../../state/OwnedStatsProvider';
import { buildAdminAccessKey } from '../../state/useAdminAccess';
import AdminScreen from '../admin';

import {
  ACCESS_ROUTE,
  ACCESS_UPDATE_ROUTE,
  ADMIN_GRANT_NAME,
  NOT_AVAILABLE_TEXT,
  PROFILE_ROUTE,
  buildEntry,
  buildErrorReply,
  entryReply,
  meReply,
  rawEntryReply,
} from './adminAccessTestSupport';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    mockValues: values,
    getItemAsync: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock('../../state/SyncProvider', () => ({
  useSync: () => ({
    cancelPass: () => undefined,
    isSyncing: false,
    isUploadCapReached: false,
    syncNow: () => Promise.resolve(true),
  }),
}));

jest.mock('expo-router', () =>
  require('../../config/buildExpoRouterMock').buildExpoRouterMock({ readParams: () => ({}) }),
);

type SecureStoreMock = { mockValues: Map<string, string> };
const secureStore = jest.requireMock('expo-secure-store') as SecureStoreMock;

let queryClient: QueryClient;
const authHandle: { current: ReturnType<typeof useAuth> | null } = { current: null };

function AuthHandle() {
  authHandle.current = useAuth();
  return null;
}

async function signIn(identity: SignInIdentity): Promise<void> {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
  secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
}

function Tree({ isShowingAdmin = true }: { isShowingAdmin?: boolean }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ContentProvider contentBaseUrl={null}>
        <AuthProvider>
          <AdminCacheReset />
          <OwnedStatsProvider>
            <AuthHandle />
            {isShowingAdmin ? <AdminScreen /> : null}
          </OwnedStatsProvider>
        </AuthProvider>
      </ContentProvider>
    </QueryClientProvider>
  );
}

function listAccessReads(requests: { method: string; path: string }[]) {
  return requests.filter(({ method, path }) => method === 'GET' && path === 'admin/access');
}

function expectOneAdminH1(): void {
  const h1s = screen
    .queryAllByRole('heading')
    .filter((heading) => (heading.props['aria-level'] ?? heading.props.accessibilityLevel) === 1);
  expect(h1s).toHaveLength(1);
  expect(h1s[0]).toHaveTextContent(/^Admin$/);
}

const LOAD_FAILED_TEXT = /could not be loaded/i;

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
  queryClient = createQueryClient();
});

afterEach(async () => {
  await settle();
  queryClient.clear();
});

describe('admin route revisited', () => {
  it('fetches the access entry again when the page is opened again', async () => {
    const identity = buildIdentity();
    const { requests, setRoute } = installRoutedFetch({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    const view = await render(<Tree />);
    expect(await screen.findByRole('switch', { name: ADMIN_GRANT_NAME })).not.toBeChecked();

    await view.rerender(<Tree isShowingAdmin={false} />);
    setRoute(ACCESS_ROUTE, entryReply(buildEntry('admin')));
    await view.rerender(<Tree />);

    await waitFor(() => expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).toBeChecked());
    expect(listAccessReads(requests)).toHaveLength(2);
  });
});

describe('admin route when the access entry fails to load', () => {
  const failures = [
    { label: '503', reply: buildErrorReply(503, 'SERVICE_UNAVAILABLE', 'Database unavailable').reply },
    { label: 'a network failure', reply: 'reject' as const },
    { label: 'a malformed 200', reply: rawEntryReply('nope') },
  ];

  it.each(failures)(
    'shows a load-failed state, not "not available", for $label, and Retry loads it',
    async ({ reply }) => {
      const identity = buildIdentity();
      const { requests, setRoute } = installRoutedFetch({
        [ACCESS_ROUTE]: reply,
        [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
      });
      await signIn(identity);
      await render(<Tree />);
      await screen.findByText(LOAD_FAILED_TEXT);
      expect(screen.queryByText(NOT_AVAILABLE_TEXT)).toBeNull();
      expect(screen.queryAllByRole('switch')).toHaveLength(0);
      expectOneAdminH1();

      setRoute(ACCESS_ROUTE, entryReply(buildEntry(null)));
      await fireEvent.press(screen.getByRole('button', { name: /retry/i }));
      await screen.findByRole('switch', { name: ADMIN_GRANT_NAME });
      expect(screen.queryByText(LOAD_FAILED_TEXT)).toBeNull();
      expect(listAccessReads(requests)).toHaveLength(2);
    },
  );

  it('still shows "not available" for a 403, with no Retry', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [ACCESS_ROUTE]: buildErrorReply(403, 'ADMIN_REQUIRED', 'Admin required').reply,
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    await render(<Tree />);
    await screen.findByText(NOT_AVAILABLE_TEXT);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expectOneAdminH1();
  });
});

describe('admin route renders the one h1 in every state', () => {
  it('shows the h1 while the entry is loading and once it is ready', async () => {
    const identity = buildIdentity();
    const held = holdReply();
    installRoutedFetch({
      [ACCESS_ROUTE]: held,
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    await render(<Tree />);
    await settle();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expectOneAdminH1();
    await act(async () => held.release(entryReply(buildEntry(null))));
    await screen.findByRole('switch', { name: ADMIN_GRANT_NAME });
    expectOneAdminH1();
  });
});

describe('admin route before the stored sign-in is read', () => {
  it('shows the loading state with the h1 and never "not available"', async () => {
    const identity = buildIdentity();
    const gate = holdReply();
    installRoutedFetch({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    const realGetItem = jest.mocked(AsyncStorage.getItem).getMockImplementation();
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) => {
      if (key !== AUTH_STORAGE_KEY) return realGetItem?.(key) ?? null;
      await gate.promise;
      return stored;
    });
    try {
      await render(<Tree />);
      await settle();
      expect(screen.queryByText(NOT_AVAILABLE_TEXT)).toBeNull();
      expectOneAdminH1();
      await act(async () => gate.release({ status: 200 }));
      await screen.findByRole('switch', { name: ADMIN_GRANT_NAME });
    } finally {
      spy.mockImplementation(realGetItem);
    }
  });
});

describe('admin route change failures', () => {
  it('clears a failed change alert when the next change succeeds', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
      [ACCESS_UPDATE_ROUTE]: [
        buildErrorReply(503, 'SERVICE_UNAVAILABLE', 'down').reply,
        entryReply(buildEntry('admin')),
      ],
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    await render(<Tree />);
    await fireEvent.press(await screen.findByRole('switch', { name: ADMIN_GRANT_NAME }));
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).not.toBeChecked());

    await fireEvent.press(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }));
    await waitFor(() => expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).toBeChecked());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('admin route cache on sign-out', () => {
  it('removes the cached access entry when the user signs out', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
      'DELETE auth/sessions/current': { status: 204 },
    });
    await signIn(identity);
    await render(<Tree isShowingAdmin={false} />);
    await settle();
    queryClient.setQueryData(buildAdminAccessKey(identity.userId), buildEntry('admin'));
    expect(queryClient.getQueryData(buildAdminAccessKey(identity.userId))).toBeDefined();

    await act(async () => {
      await authHandle.current?.signOut();
    });
    await waitFor(() => expect(queryClient.getQueryData(buildAdminAccessKey(identity.userId))).toBeUndefined());
  });
});
