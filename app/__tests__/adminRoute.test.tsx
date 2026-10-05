// The admin route, app/admin.tsx, on native (IAN-601). The real AdminScreen, ContentProvider (the
// bundled manifest), AuthProvider, StatsProvider, query client, useEntitlements, and apiFetch/apiPut
// run against a routed fetch stand-in:
// - an admin sees one h1 "Admin" and one switch per product GET admin/access lists, named from
//   the manifest's language label and difficulty, checked when isGranted is true;
// - a purchased product is checked, disabled, and says it was purchased;
// - a toggle sends one PUT admin/access { productId, isGranted }, keeps the switch disabled while
//   it is in flight, and shows what the response says; a 400, 429, 503, or network failure puts
//   the switch back and shows one alert with no code, message, request id, or status;
// - a signed-in non-admin and an admin the server answers 403 ADMIN_REQUIRED see a "not available"
//   state with no switch and send no PUT; a guest, or an admin who signs out, is sent to "/" with
//   one router.replace, sees no not-available text, and sends no GET admin/access and no PUT;
// - after a toggle the signed-in user's entitlements (the source of the paid bank locks) change
//   without a reload.
// - a malformed GET admin/access reply shows the not-available state, while an extra field on an
//   entry is ignored; a PUT reply naming another
//   product changes nothing and shows the one alert; a product the manifest does not know is
//   named from its raw id and can be toggled;
// - after admin A signs out and non-admin B signs in on the same query client and AuthProvider,
//   B sees no Admin link and the not-available state, and sends no PUT.
// Identities, passwords, and request ids are built at run time.
import { randomBytes } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { escapeForRegExp } from '../../components/auth/__tests__/passwordSettingsTestSupport';
import { createQueryClient } from '../../config/queryClient';
import {
  AUTH_STORAGE_KEY,
  SESSION_TOKEN_KEY,
  buildIdentity,
  holdReply,
  installRoutedFetch,
  type FakeReply,
  type RouteReply,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
import { ContentProvider } from '../../state/ContentProvider';
import { OwnedStatsProvider } from '../../state/OwnedStatsProvider';
import { useEntitlements } from '../../state/useEntitlements';
import AdminScreen from '../admin';
import SettingsScreen from '../settings';

import {
  ACCESS_PATH,
  ACCESS_ROUTE,
  ACCESS_UPDATE_ROUTE,
  JAVASCRIPT_MEDIUM,
  JAVASCRIPT_MEDIUM_NAME,
  NOT_AVAILABLE_TEXT,
  POSTGRES_HARD,
  POSTGRES_HARD_NAME,
  PROFILE_ROUTE,
  PURCHASED_TEXT,
  PYTHON_MEDIUM,
  PYTHON_MEDIUM_NAME,
  accessReply,
  buildEntry,
  buildErrorReply,
  entryReply,
  meReply,
  mixedProducts,
  rawAccessReply,
  sessionReply,
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

const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const router = {
    back: () => undefined,
    dismissTo: () => undefined,
    navigate: () => undefined,
    push: () => undefined,
    replace: (...args: unknown[]) => mockReplace(...args),
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

type Element = ReturnType<typeof screen.getByRole>;

let queryClient: QueryClient;

// Shows the entitlements the paid bank locks read, so a test can see them change.
function EntitlementsProbe() {
  const state = useEntitlements();
  const text = state.status === 'ready' ? [...state.productIds].sort().join(',') : state.status;
  return <EntitlementsText text={text} />;
}

function EntitlementsText({ text }: { text: string }) {
  latestEntitlements.current = text;
  return null;
}

const latestEntitlements: { current: string } = { current: '' };

async function signIn(identity: SignInIdentity): Promise<void> {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
  secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
}

async function renderAdmin(): Promise<void> {
  await render(
    <QueryClientProvider client={queryClient}>
      <ContentProvider contentBaseUrl={null}>
        <AuthProvider>
          <OwnedStatsProvider>
            <AdminScreen />
            <EntitlementsProbe />
          </OwnedStatsProvider>
        </AuthProvider>
      </ContentProvider>
    </QueryClientProvider>,
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function getSwitch(name: RegExp): Element {
  return screen.getByRole('switch', { name });
}

// A React Native Switch is disabled through its disabled prop; a Pressable switch through its
// accessibility state.
function readIsDisabled(element: Element): boolean {
  const { accessibilityState, disabled, enabled } = element.props as {
    accessibilityState?: { disabled?: boolean };
    disabled?: boolean;
    enabled?: boolean;
  };
  return (
    disabled === true ||
    enabled === false ||
    accessibilityState?.disabled === true ||
    element.props['aria-disabled'] === true
  );
}

// A React Native Switch changes through onValueChange; a Pressable switch through a press.
async function toggle(element: Element): Promise<void> {
  const { onChange, onValueChange } = element.props as { onChange?: unknown; onValueChange?: unknown };
  if (typeof onValueChange === 'function' || typeof onChange === 'function') {
    let isChecked = true;
    try {
      expect(element).toBeChecked();
    } catch {
      isChecked = false;
    }
    await fireEvent(element, 'valueChange', !isChecked);
  } else {
    await fireEvent.press(element);
  }
}

async function renderSignedInAdmin(routes: Record<string, RouteReply | RouteReply[]>) {
  const identity = buildIdentity();
  const routed = installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }), ...routes });
  await signIn(identity);
  await renderAdmin();
  await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME });
  return { ...routed, identity };
}

function listAccessUpdates(requests: { method: string; path: string; body: unknown }[]) {
  return requests.filter(({ method, path }) => method === 'PUT' && path === ACCESS_PATH);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
  queryClient = createQueryClient();
  latestEntitlements.current = '';
  mockReplace.mockClear();
});

afterEach(async () => {
  await settle();
  queryClient.clear();
});

describe('admin route for an admin', () => {
  it('shows one h1 "Admin" and one switch per listed product, named by language and difficulty', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: accessReply(mixedProducts()) });
    const headings = screen.getAllByRole('heading');
    const level1 = headings.filter(
      (heading) => (heading.props['aria-level'] ?? heading.props.accessibilityLevel) === 1,
    );
    expect(level1).toHaveLength(1);
    expect(level1[0]).toHaveTextContent(/^Admin$/);
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(getSwitch(PYTHON_MEDIUM_NAME)).toBeTruthy();
    expect(getSwitch(POSTGRES_HARD_NAME)).toBeTruthy();
    expect(getSwitch(JAVASCRIPT_MEDIUM_NAME)).toBeTruthy();
  });

  it('checks a switch when isGranted is true and leaves it unchecked when false', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: accessReply(mixedProducts()) });
    expect(getSwitch(PYTHON_MEDIUM_NAME)).not.toBeChecked();
    expect(getSwitch(POSTGRES_HARD_NAME)).toBeChecked();
    expect(readIsDisabled(getSwitch(PYTHON_MEDIUM_NAME))).toBe(false);
    expect(readIsDisabled(getSwitch(POSTGRES_HARD_NAME))).toBe(false);
  });

  it('shows a purchased product as owned: checked, disabled, and saying it was purchased', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: accessReply(mixedProducts()) });
    const purchased = getSwitch(JAVASCRIPT_MEDIUM_NAME);
    expect(purchased).toBeChecked();
    expect(readIsDisabled(purchased)).toBe(true);
    expect(screen.getAllByText(PURCHASED_TEXT)).toHaveLength(1);
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
});

describe('admin route toggles', () => {
  it('grants with one PUT { productId, isGranted: true }, disabled while in flight, then checked', async () => {
    const held = holdReply();
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: held,
    });
    await toggle(getSwitch(PYTHON_MEDIUM_NAME));
    await waitFor(() => expect(listAccessUpdates(requests)).toHaveLength(1));
    expect(readIsDisabled(getSwitch(PYTHON_MEDIUM_NAME))).toBe(true);
    expect(listAccessUpdates(requests)[0].body).toEqual({ isGranted: true, productId: PYTHON_MEDIUM });

    await act(async () => {
      held.release(entryReply(buildEntry(PYTHON_MEDIUM, 'admin')) as FakeReply);
    });
    await waitFor(() => expect(readIsDisabled(getSwitch(PYTHON_MEDIUM_NAME))).toBe(false));
    expect(getSwitch(PYTHON_MEDIUM_NAME)).toBeChecked();
    await settle();
    expect(listAccessUpdates(requests)).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('revokes an admin grant with one PUT { productId, isGranted: false }, then unchecked', async () => {
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(POSTGRES_HARD, null)),
    });
    await toggle(getSwitch(POSTGRES_HARD_NAME));
    await waitFor(() => expect(getSwitch(POSTGRES_HARD_NAME)).not.toBeChecked());
    await settle();
    const updates = listAccessUpdates(requests);
    expect(updates).toHaveLength(1);
    expect(updates[0].body).toEqual({ isGranted: false, productId: POSTGRES_HARD });
    expect(readIsDisabled(getSwitch(POSTGRES_HARD_NAME))).toBe(false);
  });

  it('shows what the response says: a revoke the server answers as purchased stays checked and disabled', async () => {
    await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(POSTGRES_HARD, 'purchase')),
    });
    await toggle(getSwitch(POSTGRES_HARD_NAME));
    await waitFor(() => expect(readIsDisabled(getSwitch(POSTGRES_HARD_NAME))).toBe(true));
    await settle();
    expect(getSwitch(POSTGRES_HARD_NAME)).toBeChecked();
    expect(readIsDisabled(getSwitch(POSTGRES_HARD_NAME))).toBe(true);
    expect(screen.getAllByText(PURCHASED_TEXT)).toHaveLength(2);
  });

  const failures: { label: string; build: () => { reply: FakeReply; secrets: string[] } }[] = [
    {
      label: '400 INVALID_BODY',
      build: () => {
        const error = buildErrorReply(400, 'INVALID_BODY', 'Invalid request body');
        return { reply: error.reply, secrets: [error.code, error.message, error.requestId, '400'] };
      },
    },
    {
      label: '429 RATE_LIMIT_EXCEEDED',
      build: () => {
        const error = buildErrorReply(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests');
        return { reply: error.reply, secrets: [error.code, error.message, error.requestId, '429'] };
      },
    },
    {
      label: '503 SERVICE_UNAVAILABLE',
      build: () => {
        const error = buildErrorReply(503, 'SERVICE_UNAVAILABLE', 'Database unavailable');
        return { reply: error.reply, secrets: [error.code, error.message, error.requestId, '503'] };
      },
    },
    {
      label: 'a network failure',
      build: () => ({ reply: 'reject', secrets: ['Network request failed', 'TypeError'] }),
    },
  ];

  it.each(failures)('puts the switch back and shows one alert with no internal detail on $label', async ({ build }) => {
    const { reply, secrets } = build();
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: reply,
    });
    await toggle(getSwitch(PYTHON_MEDIUM_NAME));
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(readIsDisabled(getSwitch(PYTHON_MEDIUM_NAME))).toBe(false));
    await settle();
    expect(getSwitch(PYTHON_MEDIUM_NAME)).not.toBeChecked();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(listAccessUpdates(requests)).toHaveLength(1);
    expect(alert).toHaveTextContent(/\S/);
    for (const secret of secrets) expect(alert).not.toHaveTextContent(new RegExp(escapeForRegExp(secret)));
  });

  it('keeps one alert after two failures in a row and leaves the other switches as they were', async () => {
    const first = buildErrorReply(503, 'SERVICE_UNAVAILABLE', 'Database unavailable');
    await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: first.reply,
    });
    await toggle(getSwitch(PYTHON_MEDIUM_NAME));
    await screen.findByRole('alert');
    await waitFor(() => expect(readIsDisabled(getSwitch(PYTHON_MEDIUM_NAME))).toBe(false));
    await toggle(getSwitch(POSTGRES_HARD_NAME));
    await waitFor(() => expect(readIsDisabled(getSwitch(POSTGRES_HARD_NAME))).toBe(false));
    await settle();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(getSwitch(PYTHON_MEDIUM_NAME)).not.toBeChecked();
    expect(getSwitch(POSTGRES_HARD_NAME)).toBeChecked();
    expect(getSwitch(JAVASCRIPT_MEDIUM_NAME)).toBeChecked();
  });
});

describe('admin route for anyone who is not an admin', () => {
  async function expectNotAvailable(requests: { method: string; path: string }[]): Promise<void> {
    await screen.findByText(NOT_AVAILABLE_TEXT);
    await settle();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(listAccessUpdates(requests as { method: string; path: string; body: unknown }[])).toHaveLength(0);
  }

  it('shows a signed-in non-admin the not-available state with no switches and no PUT', async () => {
    const identity = buildIdentity();
    const forbidden = buildErrorReply(403, 'ADMIN_REQUIRED', 'Admin required');
    const { requests } = installRoutedFetch({
      [ACCESS_ROUTE]: forbidden.reply,
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: false }),
    });
    await signIn(identity);
    await renderAdmin();
    await expectNotAvailable(requests);
  });

  it('sends a guest to the home page with one replace, no GET admin/access, and no PUT', async () => {
    const unauthorized = buildErrorReply(401, 'SESSION_REQUIRED', 'Sign-in required');
    const { requests } = installRoutedFetch({ [ACCESS_ROUTE]: unauthorized.reply });
    await renderAdmin();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByText(NOT_AVAILABLE_TEXT)).toBeNull();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(requests.some(({ method, path }) => method === 'GET' && path === ACCESS_PATH)).toBe(false);
    expect(listAccessUpdates(requests)).toHaveLength(0);
  });

  it('keeps a signed-in non-admin on the page: no replace', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [ACCESS_ROUTE]: buildErrorReply(403, 'ADMIN_REQUIRED', 'Admin required').reply,
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: false }),
    });
    await signIn(identity);
    await renderAdmin();
    await screen.findByText(NOT_AVAILABLE_TEXT);
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the same state when GET me says admin but GET admin/access answers 403 ADMIN_REQUIRED', async () => {
    const identity = buildIdentity();
    const forbidden = buildErrorReply(403, 'ADMIN_REQUIRED', 'Admin required');
    const { requests } = installRoutedFetch({
      [ACCESS_ROUTE]: forbidden.reply,
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    await renderAdmin();
    await expectNotAvailable(requests);
    expect(screen.queryByText(/ADMIN_REQUIRED/)).toBeNull();
    expect(screen.queryByText(new RegExp(forbidden.requestId))).toBeNull();
  });
});

describe('admin route keeps the entitlements current', () => {
  it('adds a granted bank to the entitlements and drops a revoked one, without a reload', async () => {
    const identity = buildIdentity();
    const { setRoute } = installRoutedFetch({
      [ACCESS_ROUTE]: accessReply([buildEntry(PYTHON_MEDIUM, null), buildEntry(JAVASCRIPT_MEDIUM, 'purchase')]),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(PYTHON_MEDIUM, 'admin')),
      [PROFILE_ROUTE]: meReply(identity.email, { entitlements: [JAVASCRIPT_MEDIUM], isAdmin: true }),
    });
    await signIn(identity);
    await renderAdmin();
    await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME });
    await waitFor(() => expect(latestEntitlements.current).toBe(JAVASCRIPT_MEDIUM));

    // The server's state once the grant commits.
    setRoute(
      PROFILE_ROUTE,
      meReply(identity.email, { entitlements: [JAVASCRIPT_MEDIUM, PYTHON_MEDIUM], isAdmin: true }),
    );
    await toggle(getSwitch(PYTHON_MEDIUM_NAME));
    await waitFor(() => expect(getSwitch(PYTHON_MEDIUM_NAME)).toBeChecked());
    await waitFor(() => expect(latestEntitlements.current).toBe([JAVASCRIPT_MEDIUM, PYTHON_MEDIUM].sort().join(',')));

    // And once the revoke commits.
    setRoute(ACCESS_UPDATE_ROUTE, entryReply(buildEntry(PYTHON_MEDIUM, null)));
    setRoute(PROFILE_ROUTE, meReply(identity.email, { entitlements: [JAVASCRIPT_MEDIUM], isAdmin: true }));
    await waitFor(() => expect(readIsDisabled(getSwitch(PYTHON_MEDIUM_NAME))).toBe(false));
    await toggle(getSwitch(PYTHON_MEDIUM_NAME));
    await waitFor(() => expect(getSwitch(PYTHON_MEDIUM_NAME)).not.toBeChecked());
    await waitFor(() => expect(latestEntitlements.current).toBe(JAVASCRIPT_MEDIUM));
  });
});

describe('admin route with malformed server data', () => {
  async function expectNotAvailable(requests: { method: string; path: string; body: unknown }[]): Promise<void> {
    await screen.findByText(NOT_AVAILABLE_TEXT);
    await settle();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(listAccessUpdates(requests)).toHaveLength(0);
  }

  const malformedLists: { label: string; products: () => unknown }[] = [
    {
      label: 'a non-boolean isGranted',
      products: () => [{ grantSource: 'admin', isGranted: 'true', productId: PYTHON_MEDIUM }],
    },
    {
      label: 'an unknown grantSource',
      products: () => [{ grantSource: 'gift', isGranted: true, productId: PYTHON_MEDIUM }],
    },
    {
      label: 'products that are not an array',
      products: () => ({ [PYTHON_MEDIUM]: buildEntry(PYTHON_MEDIUM, 'admin') }),
    },
  ];

  it.each(malformedLists)(
    'shows the not-available state with no switches and no PUT for $label',
    async ({ products }) => {
      const identity = buildIdentity();
      const { requests } = installRoutedFetch({
        [ACCESS_ROUTE]: rawAccessReply(products()),
        [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
      });
      await signIn(identity);
      await renderAdmin();
      await expectNotAvailable(requests);
    },
  );

  it('renders an entry with an extra field from its three known fields and shows the extra value nowhere', async () => {
    const marker = `marker-${randomBytes(6).toString('hex')}`;
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: rawAccessReply([
        { ...buildEntry(PYTHON_MEDIUM, null), displayName: marker, isPurchased: true },
        buildEntry(POSTGRES_HARD, 'admin'),
      ]),
    });
    await settle();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    const python = getSwitch(PYTHON_MEDIUM_NAME);
    expect(python).not.toBeChecked();
    expect(readIsDisabled(python)).toBe(false);
    expect(screen.queryByText(PURCHASED_TEXT)).toBeNull();
    expect(screen.queryByText(new RegExp(escapeForRegExp(marker)))).toBeNull();
    expect(screen.queryByLabelText(new RegExp(escapeForRegExp(marker)))).toBeNull();
    expect(listAccessUpdates(requests)).toHaveLength(0);
  });

  it('leaves the switch as it was and shows the one alert when the PUT reply names another product', async () => {
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(POSTGRES_HARD, null)),
    });
    await toggle(getSwitch(PYTHON_MEDIUM_NAME));
    await screen.findByRole('alert');
    await waitFor(() => expect(readIsDisabled(getSwitch(PYTHON_MEDIUM_NAME))).toBe(false));
    await settle();
    expect(getSwitch(PYTHON_MEDIUM_NAME)).not.toBeChecked();
    expect(getSwitch(POSTGRES_HARD_NAME)).toBeChecked();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(listAccessUpdates(requests)).toHaveLength(1);
    expect(listAccessUpdates(requests)[0].body).toEqual({ isGranted: true, productId: PYTHON_MEDIUM });
  });

  it('names a product the manifest does not know from its raw id and lets it be toggled', async () => {
    const unknownId = `syntactical.lang${randomBytes(3).toString('hex')}.medium`;
    const unknownName = new RegExp(`^${escapeForRegExp(unknownId)}$`);
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: accessReply([buildEntry(PYTHON_MEDIUM, null), buildEntry(unknownId, null)]),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(unknownId, 'admin')),
    });
    const unknown = getSwitch(unknownName);
    expect(unknown).not.toBeChecked();
    expect(readIsDisabled(unknown)).toBe(false);
    await toggle(unknown);
    await waitFor(() => expect(getSwitch(unknownName)).toBeChecked());
    await settle();
    expect(listAccessUpdates(requests).map(({ body }) => body)).toEqual([{ isGranted: true, productId: unknownId }]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('admin route when the admin signs out', () => {
  const authHandle: { current: ReturnType<typeof useAuth> | null } = { current: null };

  function AuthHandle() {
    authHandle.current = useAuth();
    return null;
  }

  it('replaces to the home page once and stays off /admin, with no not-available text', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
      'DELETE auth/sessions/current': { status: 204 },
    });
    await signIn(identity);
    await render(
      <QueryClientProvider client={queryClient}>
        <ContentProvider contentBaseUrl={null}>
          <AuthProvider>
            <OwnedStatsProvider>
              <AuthHandle />
              <AdminScreen />
            </OwnedStatsProvider>
          </AuthProvider>
        </ContentProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME });
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      await authHandle.current?.signOut();
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByText(NOT_AVAILABLE_TEXT)).toBeNull();
  });
});

describe('admin route across an account switch on one query client', () => {
  const authHandle: { current: ReturnType<typeof useAuth> | null } = { current: null };

  function AuthHandle() {
    authHandle.current = useAuth();
    return null;
  }

  it('shows non-admin B no Admin link and the not-available state after admin A signs out', async () => {
    const adminA = buildIdentity();
    const memberB = buildIdentity();
    const { requests, setRoute } = installRoutedFetch({
      [ACCESS_ROUTE]: accessReply(mixedProducts()),
      [PROFILE_ROUTE]: meReply(adminA.email, { isAdmin: true }),
      'DELETE auth/sessions/current': { status: 204 },
      'POST auth/sessions/password': sessionReply(memberB),
    });
    await signIn(adminA);
    await render(
      <QueryClientProvider client={queryClient}>
        <ContentProvider contentBaseUrl={null}>
          <AuthProvider>
            <OwnedStatsProvider>
              <AuthHandle />
              <AdminScreen />
              <SettingsScreen />
            </OwnedStatsProvider>
          </AuthProvider>
        </ContentProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole('switch', { name: PYTHON_MEDIUM_NAME });
    await screen.findByRole('link', { name: 'Admin' });

    await act(async () => {
      await authHandle.current?.signOut();
    });
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull());

    setRoute(PROFILE_ROUTE, meReply(memberB.email, { isAdmin: false }));
    setRoute(ACCESS_ROUTE, buildErrorReply(403, 'ADMIN_REQUIRED', 'Admin required').reply);
    const password = randomBytes(12).toString('hex');
    await act(async () => {
      const result = await authHandle.current?.signInWithPassword(memberB.email, password);
      expect(result).toEqual({ isOk: true });
    });

    await screen.findByLabelText('New password');
    await screen.findByText(NOT_AVAILABLE_TEXT);
    await settle();
    expect(requests.some(({ method, path }) => method === 'GET' && path === 'me')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(listAccessUpdates(requests)).toHaveLength(0);
    const accessReads = requests.filter(({ method, path }) => method === 'GET' && path === ACCESS_PATH);
    expect(accessReads.length).toBeGreaterThanOrEqual(2);
    expect(accessReads[accessReads.length - 1].headers.authorization).toContain(memberB.sessionValue);
  });
});
