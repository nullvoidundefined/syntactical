// The admin route's load and failure states on native (IAN-636), with the real AdminScreen,
// AuthProvider, query client, and apiFetch/apiPut against a routed fetch stand-in:
// - the access list is fetched again each time the page is opened;
// - only a 401 or 403 shows "not available"; any other failed load shows a load-failed state with
//   a Retry button that fetches again;
// - every state (loading, not available, load failed, ready) renders the one h1 "Admin";
// - a failed change's alert stays while another change is still in flight;
// - signing out removes the cached access list;
// - an id listed twice shows once, with no duplicate-key warning;
// - before the stored sign-in is read, the page shows the loading state, not "not available".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createQueryClient } from '../../config/queryClient';
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
import AdminScreen from '../admin';

import {
  ACCESS_ROUTE,
  ACCESS_UPDATE_ROUTE,
  JAVASCRIPT_MEDIUM,
  NOT_AVAILABLE_TEXT,
  POSTGRES_HARD,
  PROFILE_ROUTE,
  PYTHON_MEDIUM,
  PYTHON_MEDIUM_NAME,
  accessReply,
  buildEntry,
  buildErrorReply,
  entryReply,
  meReply,
  mixedProducts,
  rawAccessReply,
} from './adminAccessTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

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

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function listAccessReads(requests: { method: string; path: string }[]) {
  return requests.filter(({ method, path }) => method === 'GET' && path === 'admin/access');
}

function getH1s() {
  return screen
    .queryAllByRole('heading')
    .filter((heading) => (heading.props['aria-level'] ?? heading.props.accessibilityLevel) === 1);
}

function expectOneAdminH1(): void {
  const h1s = getH1s();
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
  it('fetches the access list again when the page is opened again', async () => {
    const identity = buildIdentity();
    const { requests, setRoute } = installRoutedFetch({
      [ACCESS_ROUTE]: accessReply([buildEntry(PYTHON_MEDIUM, null)]),
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    const view = await render(<Tree />);
    expect(await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME })).not.toBeChecked();

    await view.rerender(<Tree isShowingAdmin={false} />);
    setRoute(ACCESS_ROUTE, accessReply([buildEntry(PYTHON_MEDIUM, 'admin')]));
    await view.rerender(<Tree />);

    await waitFor(() => expect(screen.getByRole('switch', { name: PYTHON_MEDIUM_NAME })).toBeChecked());
    expect(listAccessReads(requests)).toHaveLength(2);
  });
});

describe('admin route when the access list fails to load', () => {
  const failures = [
    { label: '503', reply: buildErrorReply(503, 'SERVICE_UNAVAILABLE', 'Database unavailable').reply },
    { label: 'a network failure', reply: 'reject' as const },
    { label: 'a malformed 200', reply: rawAccessReply('nope') },
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

      setRoute(ACCESS_ROUTE, accessReply(mixedProducts()));
      await fireEvent.press(screen.getByRole('button', { name: /retry/i }));
      await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME });
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
  it('shows the h1 while the list is loading and once it is ready', async () => {
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
    await act(async () => held.release(accessReply(mixedProducts())));
    await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME });
    expectOneAdminH1();
  });
});

describe('admin route before the stored sign-in is read', () => {
  it('shows the loading state with the h1 and never "not available"', async () => {
    const identity = buildIdentity();
    const gate = holdReply();
    installRoutedFetch({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
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
      await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME });
    } finally {
      spy.mockImplementation(realGetItem);
    }
  });
});

describe('admin route change failures', () => {
  it('keeps a failed change alert when another change starts while one is still in flight', async () => {
    const identity = buildIdentity();
    const first = holdReply();
    const second = holdReply();
    const third = holdReply();
    installRoutedFetch({
      [ACCESS_ROUTE]: accessReply([
        buildEntry(PYTHON_MEDIUM, null),
        buildEntry(POSTGRES_HARD, null),
        buildEntry(JAVASCRIPT_MEDIUM, null),
      ]),
      [ACCESS_UPDATE_ROUTE]: [first, second, third],
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    await render(<Tree />);
    const switches = await screen.findAllByRole('switch');
    await fireEvent.press(switches[0]);
    await fireEvent.press(switches[1]);
    await act(async () => first.release(buildErrorReply(503, 'SERVICE_UNAVAILABLE', 'down').reply));
    await screen.findByRole('alert');

    await fireEvent.press(screen.getAllByRole('switch')[2]);
    await settle();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await act(async () => {
      second.release(entryReply(buildEntry(POSTGRES_HARD, 'admin')));
      third.release(entryReply(buildEntry(JAVASCRIPT_MEDIUM, 'admin')));
    });
  });
});

describe('admin route cache on sign-out', () => {
  it('removes the cached access list when the user signs out', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
      'DELETE auth/sessions/current': { status: 204 },
    });
    await signIn(identity);
    await render(<Tree isShowingAdmin={false} />);
    await settle();
    queryClient.setQueryData(['admin', 'access', identity.userId], mixedProducts());
    expect(queryClient.getQueryData(['admin', 'access', identity.userId])).toBeDefined();

    await act(async () => {
      await authHandle.current?.signOut();
    });
    await waitFor(() => expect(queryClient.getQueryData(['admin', 'access', identity.userId])).toBeUndefined());
  });
});

describe('admin route with a repeated product id', () => {
  it('shows one switch for the id and logs no duplicate-key warning', async () => {
    const identity = buildIdentity();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      installRoutedFetch({
        [ACCESS_ROUTE]: accessReply([buildEntry(PYTHON_MEDIUM, null), buildEntry(PYTHON_MEDIUM, 'admin')]),
        [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
      });
      await signIn(identity);
      await render(<Tree />);
      await screen.findAllByRole('switch', { name: PYTHON_MEDIUM_NAME });
      expect(screen.getAllByRole('switch')).toHaveLength(1);
      expect(errors.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false);
    } finally {
      errors.mockRestore();
    }
  });
});
