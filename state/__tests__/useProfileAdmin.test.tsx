// useProfile exposes isAdmin from GET /v1/me (IAN-601): true only when the server says so, false
// when GET me says false or leaves the field out, and false for a guest, who makes no request.
// Real AuthProvider, StatsProvider, query client, and apiFetch against a routed fetch stand-in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import { PROFILE_ROUTE, meReply } from '../../app/__tests__/adminAccessTestSupport';
import { createQueryClient } from '../../config/queryClient';
import { AuthProvider } from '../AuthProvider';
import { OwnedStatsProvider } from '../OwnedStatsProvider';
import { useProfile } from '../useProfile';

import { AUTH_STORAGE_KEY, buildIdentity, installRoutedFetch, type SignInIdentity } from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../SyncProvider', () => ({
  useSync: () => ({
    cancelPass: () => undefined,
    isSyncing: false,
    isUploadCapReached: false,
    syncNow: () => Promise.resolve(true),
  }),
}));

const latest: { profile: ReturnType<typeof useProfile> | null } = { profile: null };

function Probe() {
  latest.profile = useProfile();
  return null;
}

async function renderProbe(): Promise<void> {
  await render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <OwnedStatsProvider>
          <Probe />
        </OwnedStatsProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function signIn(identity: SignInIdentity): Promise<void> {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  latest.profile = null;
});

describe('useProfile isAdmin', () => {
  it('is true when GET me says isAdmin true', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: true }) });
    await signIn(identity);
    await renderProbe();
    await waitFor(() => expect(latest.profile?.snapshot).not.toBeNull());
    await waitFor(() => expect(latest.profile?.isAdmin).toBe(true));
  });

  it('is false when GET me says isAdmin false', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email, { isAdmin: false }) });
    await signIn(identity);
    await renderProbe();
    await waitFor(() => expect(latest.profile?.snapshot).not.toBeNull());
    expect(latest.profile?.isAdmin).toBe(false);
  });

  it('is false when GET me leaves isAdmin out', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: meReply(identity.email) });
    await signIn(identity);
    await renderProbe();
    await waitFor(() => expect(latest.profile?.snapshot).not.toBeNull());
    expect(latest.profile?.isAdmin).toBe(false);
  });

  it('is false when GET me sends a non-boolean isAdmin (malformed input)', async () => {
    const identity = buildIdentity();
    const reply = meReply(identity.email);
    if (reply !== 'reject') (reply.body as { data: Record<string, unknown> }).data.isAdmin = 'true';
    installRoutedFetch({ [PROFILE_ROUTE]: reply });
    await signIn(identity);
    await renderProbe();
    await waitFor(() => expect(latest.profile?.snapshot).not.toBeNull());
    expect(latest.profile?.isAdmin).toBe(false);
  });

  it('is false for a guest, who sends no GET me', async () => {
    const { requests } = installRoutedFetch({});
    await renderProbe();
    await waitFor(() => expect(latest.profile).not.toBeNull());
    expect(latest.profile?.isAdmin).toBe(false);
    expect(requests.filter(({ path }) => path === 'me')).toHaveLength(0);
  });
});
