// The admin route, app/admin.tsx, on native. The real AdminScreen, AuthProvider, StatsProvider,
// query client, useProStatus, and apiFetch/apiPut run against a routed fetch stand-in:
// - an admin sees one h1 "Admin" and one switch, "Pro (admin grant)", checked when isGranted;
// - Pro bought through a store shows as "Pro (purchased)", checked and disabled;
// - a toggle sends one PUT admin/access { isGranted }, keeps the switch disabled while it is in
//   flight, and shows what the response says; a 400, 429, 503, or network failure puts the switch
//   back and shows one alert with no code, message, request id, or status;
// - a signed-in non-admin, and an admin the server answers 403, see "not available" with no switch
//   and send no PUT; a guest, or an admin who signs out, is sent to "/" with one router.replace;
// - after a toggle the user's Pro status (useProStatus) follows without a reload;
// - a malformed GET admin/access reply shows the load-failed state;
// - after admin A signs out and non-admin B signs in on the same query client, B sees no Admin
//   link and the not-available state, and sends no PUT.
// Identities, passwords, and request ids are built at run time.
import { randomBytes } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { escapeForRegExp } from '../../components/auth/__tests__/passwordSettingsTestSupport';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
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
import { useProStatus } from '../../state/useProStatus';
import AdminScreen from '../admin';
import SettingsScreen from '../settings';

import {
  ACCESS_PATH,
  ACCESS_ROUTE,
  ACCESS_UPDATE_ROUTE,
  ADMIN_GRANT_NAME,
  NOT_AVAILABLE_TEXT,
  PROFILE_ROUTE,
  PURCHASED_NAME,
  buildEntry,
  buildErrorReply,
  entryReply,
  meReply,
  rawEntryReply,
  sessionReply,
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

const mockReplace = jest.fn();

jest.mock('expo-router', () =>
  require('../../config/buildExpoRouterMock').buildExpoRouterMock({
    replace: (...args: unknown[]) => mockReplace(...args),
    readParams: () => ({}),
  }),
);

type SecureStoreMock = { mockValues: Map<string, string> };
const secureStore = jest.requireMock('expo-secure-store') as SecureStoreMock;

type Element = ReturnType<typeof screen.getByRole>;

let queryClient: QueryClient;
const latestPro: { status: string } = { status: '' };

// Shows what useProStatus reads, so a test can see it follow an admin change.
function ProStatusProbe() {
  const state = useProStatus();
  latestPro.status = state.status === 'ready' ? (state.isPro ? 'pro' : 'free') : state.status;
  return null;
}

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
            <ProStatusProbe />
          </OwnedStatsProvider>
        </AuthProvider>
      </ContentProvider>
    </QueryClientProvider>,
  );
}

function readIsDisabled(element: Element): boolean {
  const { accessibilityState, disabled } = element.props as {
    accessibilityState?: { disabled?: boolean };
    disabled?: boolean;
  };
  return disabled === true || accessibilityState?.disabled === true || element.props['aria-disabled'] === true;
}

async function renderSignedInAdmin(routes: Record<string, RouteReply | RouteReply[]>, name = ADMIN_GRANT_NAME) {
  const identity = buildIdentity();
  const routed = installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }), ...routes });
  await signIn(identity);
  await renderAdmin();
  await screen.findByRole('switch', { name });
  return { ...routed, identity };
}

function listAccessUpdates(requests: { method: string; path: string; body: unknown }[]) {
  return requests.filter(({ method, path }) => method === 'PUT' && path === ACCESS_PATH);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
  queryClient = createQueryClient();
  latestPro.status = '';
  mockReplace.mockClear();
});

afterEach(async () => {
  await settle();
  queryClient.clear();
});

describe('admin route for an admin', () => {
  it('shows one h1 "Admin" and one switch, "Pro (admin grant)", unchecked and enabled with no grant', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: entryReply(buildEntry(null)) });
    const level1 = screen
      .getAllByRole('heading')
      .filter((heading) => (heading.props['aria-level'] ?? heading.props.accessibilityLevel) === 1);
    expect(level1).toHaveLength(1);
    expect(level1[0]).toHaveTextContent(/^Admin$/);
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    const proSwitch = screen.getByRole('switch', { name: ADMIN_GRANT_NAME });
    expect(proSwitch).not.toBeChecked();
    expect(readIsDisabled(proSwitch)).toBe(false);
  });

  it('checks the switch for an admin grant and leaves it enabled', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: entryReply(buildEntry('admin')) });
    const proSwitch = screen.getByRole('switch', { name: ADMIN_GRANT_NAME });
    expect(proSwitch).toBeChecked();
    expect(readIsDisabled(proSwitch)).toBe(false);
  });

  it('shows store-bought Pro as "Pro (purchased)": checked and disabled', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: entryReply(buildEntry('purchase')) }, PURCHASED_NAME);
    const proSwitch = screen.getByRole('switch', { name: PURCHASED_NAME });
    expect(proSwitch).toBeChecked();
    expect(readIsDisabled(proSwitch)).toBe(true);
    expect(screen.queryByRole('switch', { name: ADMIN_GRANT_NAME })).toBeNull();
  });

  it('draws the switch as a track and thumb hidden from assistive technology, still role switch', async () => {
    await renderSignedInAdmin({ [ACCESS_ROUTE]: entryReply(buildEntry(null)) });
    const proSwitch = screen.getByRole('switch', { name: ADMIN_GRANT_NAME });
    for (const testID of ['switch-track-off', 'switch-thumb-off']) {
      const part = within(proSwitch).getByTestId(testID, { includeHiddenElements: true });
      expect(part.props['aria-hidden']).toBe(true);
    }
    const track = within(proSwitch).getByTestId('switch-track-off', { includeHiddenElements: true });
    expect(track.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(within(proSwitch).queryByTestId('switch-track-off')).toBeNull();
  });
});

describe('admin route toggles', () => {
  it('grants with one PUT { isGranted: true }, disabled while in flight, then checked', async () => {
    const held = holdReply();
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
      [ACCESS_UPDATE_ROUTE]: held,
    });
    await fireEvent.press(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }));
    await waitFor(() => expect(listAccessUpdates(requests)).toHaveLength(1));
    expect(readIsDisabled(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }))).toBe(true);
    expect(listAccessUpdates(requests)[0].body).toEqual({ isGranted: true });

    await act(async () => {
      held.release(entryReply(buildEntry('admin')) as FakeReply);
    });
    await waitFor(() => expect(readIsDisabled(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }))).toBe(false));
    expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).toBeChecked();
    await settle();
    expect(listAccessUpdates(requests)).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('revokes an admin grant with one PUT { isGranted: false }, then unchecked', async () => {
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: entryReply(buildEntry('admin')),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry(null)),
    });
    await fireEvent.press(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }));
    await waitFor(() => expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).not.toBeChecked());
    await settle();
    expect(listAccessUpdates(requests).map(({ body }) => body)).toEqual([{ isGranted: false }]);
  });

  it('shows what the response says: a revoke answered as purchased becomes "Pro (purchased)", checked and disabled', async () => {
    await renderSignedInAdmin({
      [ACCESS_ROUTE]: entryReply(buildEntry('admin')),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry('purchase')),
    });
    await fireEvent.press(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }));
    const purchased = await screen.findByRole('switch', { name: PURCHASED_NAME });
    expect(purchased).toBeChecked();
    expect(readIsDisabled(purchased)).toBe(true);
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
    {
      label: 'a malformed 200',
      build: () => ({ reply: rawEntryReply({ isGranted: 'yes' }), secrets: ['yes'] }),
    },
  ];

  it.each(failures)('puts the switch back and shows one alert with no internal detail on $label', async ({ build }) => {
    const { reply, secrets } = build();
    const { requests } = await renderSignedInAdmin({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
      [ACCESS_UPDATE_ROUTE]: reply,
    });
    await fireEvent.press(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }));
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(readIsDisabled(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }))).toBe(false));
    await settle();
    expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).not.toBeChecked();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(listAccessUpdates(requests)).toHaveLength(1);
    expect(alert).toHaveTextContent(/\S/);
    for (const secret of secrets) expect(alert).not.toHaveTextContent(new RegExp(escapeForRegExp(secret)));
  });
});

describe('admin route keeps the Pro status current', () => {
  it('makes useProStatus read Pro after a grant and free after a revoke, without a reload', async () => {
    const identity = buildIdentity();
    const { setRoute } = installRoutedFetch({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
      [ACCESS_UPDATE_ROUTE]: entryReply(buildEntry('admin')),
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    await renderAdmin();
    await screen.findByRole('switch', { name: ADMIN_GRANT_NAME });
    await waitFor(() => expect(latestPro.status).toBe('free'));

    // The server's state once the grant commits.
    setRoute(PROFILE_ROUTE, meReply(identity.email, { isAdmin: true, isPro: true }));
    await fireEvent.press(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }));
    await waitFor(() => expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).toBeChecked());
    await waitFor(() => expect(latestPro.status).toBe('pro'));

    // And once the revoke commits.
    setRoute(ACCESS_UPDATE_ROUTE, entryReply(buildEntry(null)));
    setRoute(PROFILE_ROUTE, meReply(identity.email, { isAdmin: true }));
    await waitFor(() => expect(readIsDisabled(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }))).toBe(false));
    await fireEvent.press(screen.getByRole('switch', { name: ADMIN_GRANT_NAME }));
    await waitFor(() => expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).not.toBeChecked());
    await waitFor(() => expect(latestPro.status).toBe('free'));
  });
});

describe('admin route for anyone who is not an admin', () => {
  async function expectNotAvailable(requests: { method: string; path: string; body: unknown }[]): Promise<void> {
    await screen.findByText(NOT_AVAILABLE_TEXT);
    await settle();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(listAccessUpdates(requests)).toHaveLength(0);
  }

  it('shows a signed-in non-admin the not-available state with no switch and no PUT, and no replace', async () => {
    const identity = buildIdentity();
    const { requests } = installRoutedFetch({
      [ACCESS_ROUTE]: buildErrorReply(403, 'ADMIN_REQUIRED', 'Admin required').reply,
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: false }),
    });
    await signIn(identity);
    await renderAdmin();
    await expectNotAvailable(requests);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the same state when GET me says admin but GET admin/access answers 403, with no server detail', async () => {
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

  it('sends a guest to the home page with one replace, no GET admin/access, and no PUT', async () => {
    const { requests } = installRoutedFetch({
      [ACCESS_ROUTE]: buildErrorReply(401, 'SESSION_REQUIRED', 'Sign-in required').reply,
    });
    await renderAdmin();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByText(NOT_AVAILABLE_TEXT)).toBeNull();
    expect(requests.some(({ method, path }) => method === 'GET' && path === ACCESS_PATH)).toBe(false);
    expect(listAccessUpdates(requests)).toHaveLength(0);
  });
});

describe('admin route with a malformed access entry', () => {
  it.each([
    ['a non-boolean isGranted', { grantSource: 'admin', isGranted: 'true', productId: 'syntactical.pro.lifetime' }],
    ['an unknown grantSource', { grantSource: 'gift', isGranted: true, productId: 'syntactical.pro.lifetime' }],
    ['a list instead of one entry', [buildEntry('admin')]],
  ])('shows the load-failed state with no switch and no PUT for %s', async (_label, data) => {
    const identity = buildIdentity();
    const { requests } = installRoutedFetch({
      [ACCESS_ROUTE]: rawEntryReply(data),
      [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }),
    });
    await signIn(identity);
    await renderAdmin();
    await screen.findByText(/could not be loaded/i);
    expect(screen.queryByText(NOT_AVAILABLE_TEXT)).toBeNull();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(listAccessUpdates(requests)).toHaveLength(0);
  });

  it('ignores an extra field on the entry and shows its value nowhere', async () => {
    const marker = `marker-${randomBytes(6).toString('hex')}`;
    await renderSignedInAdmin({ [ACCESS_ROUTE]: rawEntryReply({ ...buildEntry(null), displayName: marker }) });
    expect(screen.getByRole('switch', { name: ADMIN_GRANT_NAME })).not.toBeChecked();
    expect(screen.queryByText(new RegExp(escapeForRegExp(marker)))).toBeNull();
  });
});

describe('admin route when the admin signs out', () => {
  const authHandle: { current: ReturnType<typeof useAuth> | null } = { current: null };

  function AuthHandle() {
    authHandle.current = useAuth();
    return null;
  }

  it('replaces to the home page once, with no not-available text', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
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
    await screen.findByRole('switch', { name: ADMIN_GRANT_NAME });
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      await authHandle.current?.signOut();
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByText(NOT_AVAILABLE_TEXT)).toBeNull();
  });

  it('shows non-admin B no Admin link and the not-available state after admin A signs out', async () => {
    const adminA = buildIdentity();
    const memberB = buildIdentity();
    const { requests, setRoute } = installRoutedFetch({
      [ACCESS_ROUTE]: entryReply(buildEntry(null)),
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
    await screen.findByRole('switch', { name: ADMIN_GRANT_NAME });
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
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(listAccessUpdates(requests)).toHaveLength(0);
    const accessReads = requests.filter(({ method, path }) => method === 'GET' && path === ACCESS_PATH);
    expect(accessReads[accessReads.length - 1].headers.authorization).toContain(memberB.sessionValue);
  });
});
