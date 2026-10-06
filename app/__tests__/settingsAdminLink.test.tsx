// The Settings "Admin" link (IAN-601). The real SettingsScreen, AuthProvider, StatsProvider, query
// client, and apiFetch run against a routed fetch stand-in:
// - a signed-in user whose GET me says isAdmin true sees one link named "Admin", and pressing it
//   goes to /admin;
// - a signed-in user whose GET me says isAdmin false, or leaves it out, sees no Admin link;
// - a guest sees no Admin link.
// Identities are built at run time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { createQueryClient } from '../../config/queryClient';
import {
  AUTH_STORAGE_KEY,
  SESSION_TOKEN_KEY,
  buildIdentity,
  installRoutedFetch,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider } from '../../state/AuthProvider';
import { OwnedStatsProvider } from '../../state/OwnedStatsProvider';
import SettingsScreen from '../settings';

import { PROFILE_ROUTE, meReply } from './adminAccessTestSupport';

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

const mockNavigations: unknown[] = [];
jest.mock('expo-router', () => {
  function record(href: unknown) {
    mockNavigations.push(href);
  }
  const router = { back: () => undefined, dismissTo: record, navigate: record, push: record, replace: record };
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

// The password form appears once GET me has answered with the account facts.
const ACCOUNT_LOADED_LABEL = 'New password';

function readPathname(href: unknown): unknown {
  return typeof href === 'object' && href !== null ? (href as { pathname?: unknown }).pathname : href;
}

async function signIn(identity: SignInIdentity): Promise<void> {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
  secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
}

async function renderSettings(): Promise<void> {
  await render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <OwnedStatsProvider>
          <SettingsScreen />
        </OwnedStatsProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
  mockNavigations.length = 0;
});

describe('Settings Admin link', () => {
  it('shows one "Admin" link to an admin, and pressing it goes to /admin', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }) });
    await signIn(identity);
    await renderSettings();
    const link = await screen.findByRole('link', { name: 'Admin' });
    expect(screen.getAllByRole('link', { name: 'Admin' })).toHaveLength(1);
    await fireEvent.press(link);
    expect(mockNavigations.map(readPathname)).toEqual(['/admin']);
  });

  it('shows no Admin link to a signed-in user whose GET me says isAdmin false', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: false }) });
    await signIn(identity);
    await renderSettings();
    await screen.findByLabelText(ACCOUNT_LOADED_LABEL);
    await settle();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryByText('Admin')).toBeNull();
  });

  it('shows no Admin link when GET me leaves isAdmin out', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email) });
    await signIn(identity);
    await renderSettings();
    await screen.findByLabelText(ACCOUNT_LOADED_LABEL);
    await settle();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('shows a guest no Admin link', async () => {
    installRoutedFetch({});
    await renderSettings();
    await screen.findByRole('link', { name: 'Sign in' });
    await settle();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryByText('Admin')).toBeNull();
  });
});
