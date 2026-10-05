// The admin route, app/admin.tsx, on native (IAN-601). The real AdminScreen, ContentProvider (the
// bundled manifest), AuthProvider, StatsProvider, query client, useEntitlements, and apiFetch/apiPut
// run against a routed fetch stand-in:
// - an admin sees one h1 "Admin" and one switch per product GET admin/access lists, named from
//   the manifest's language label and difficulty, checked when isGranted is true;
// - a purchased product is checked, disabled, and says it was purchased;
// - a toggle sends one PUT admin/access { productId, isGranted }, keeps the switch disabled while
//   it is in flight, and shows what the response says; a 400, 429, 503, or network failure puts
//   the switch back and shows one alert with no code, message, request id, or status;
// - a non-admin, a guest, and an admin the server answers 403 ADMIN_REQUIRED see a "not available"
//   (or not found) state with no switch and send no PUT;
// - after a toggle the signed-in user's entitlements (the source of the paid bank locks) change
//   without a reload.
// Identities and request ids are built at run time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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
import { AuthProvider } from '../../state/AuthProvider';
import { ContentProvider } from '../../state/ContentProvider';
import { OwnedStatsProvider } from '../../state/OwnedStatsProvider';
import { useEntitlements } from '../../state/useEntitlements';
import AdminScreen from '../admin';

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

  it('shows a guest the not-available state with no switches and no PUT', async () => {
    const unauthorized = buildErrorReply(401, 'SESSION_REQUIRED', 'Sign-in required');
    const { requests } = installRoutedFetch({ [ACCESS_ROUTE]: unauthorized.reply });
    await renderAdmin();
    await expectNotAvailable(requests);
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
