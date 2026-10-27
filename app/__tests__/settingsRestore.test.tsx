// Restore purchases in Settings on native: the control calls react-native-purchases'
// restorePurchases, then GET me, and the Pro status the app reads (useProStatus, shown here by a
// probe on the same query client) follows what the server says. A failed restore changes nothing,
// and a restore the store accepts but GET me does not confirm leaves the user free: the server is
// the only source of Pro.
import { randomBytes } from 'node:crypto';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import '../../components/auth/__tests__/preloadNativeModal';
import {
  SIGNED_IN_USER,
  countMeRequests,
  fakeAuth,
  fakeServer,
  nativeSdk,
  resetFakes,
  serveApp,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import { useProStatus } from '../../state/useProStatus';
import SettingsScreen from '../settings';

// Built at run time so no credential-shaped literal sits in source.
setExpoExtra({
  apiBaseUrl: 'https://api.syntactical.dev/v1/',
  contentBaseUrl: 'https://example.test/content/',
  revenueCatAppleKey: `appl_${randomBytes(12).toString('hex')}`,
  revenueCatGoogleKey: `goog_${randomBytes(12).toString('hex')}`,
});
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-purchases', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildNativePurchasesModule(),
);
jest.mock('../../state/AuthProvider', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);
jest.mock('expo-router', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildRouterModule(() => ({})),
);
jest.mock('../../state/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ setDailyGoal: () => undefined }),
}));
jest.mock('../../state/useProfile', () => ({
  useProfile: () => ({ snapshot: null, updateDailyGoal: () => Promise.resolve(true) }),
}));
jest.mock('../../state/useProgressSummary', () => ({
  useProgressSummary: () => ({ dailyGoal: 20 }),
}));
jest.mock('../../components/auth/SignOutDialog', () => ({ SignOutDialog: () => null }));
jest.mock('../../components/auth/DeleteAccountDialog', () => ({ DeleteAccountDialog: () => null }));
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: () => undefined }));

const latest: { status: string } = { status: '' };

// Shows what useProStatus reads, so a test can see it follow the server.
function ProStatusProbe() {
  const state = useProStatus();
  latest.status = state.status === 'ready' ? (state.isPro ? `pro ${state.product}` : 'free') : state.status;
  return null;
}

let queryClient: QueryClient;

async function renderSettings(): Promise<void> {
  await render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreen />
      <ProStatusProbe />
    </QueryClientProvider>,
  );
  await settle();
}

async function pressRestore(): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
  await settle();
}

beforeEach(() => {
  resetFakes();
  queryClient = createQueryClient();
  fakeAuth.userId = SIGNED_IN_USER;
  latest.status = '';
  serveApp();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('Restore purchases in Settings on native', () => {
  it('calls restorePurchases, then GET me, and Pro follows what the server now says', async () => {
    await renderSettings();
    await waitFor(() => expect(latest.status).toBe('free'));
    const meBefore = countMeRequests();

    await pressRestore();

    expect(nativeSdk.restoreCount).toBe(1);
    await waitFor(() => expect(latest.status).toBe('pro lifetime'));
    expect(countMeRequests()).toBeGreaterThan(meBefore);
    const restoreAt = fakeServer.events.indexOf('restorePurchases');
    expect(fakeServer.events.slice(restoreAt + 1)).toContain('GET me');
  });

  it('a failed restore leaves the user free', async () => {
    nativeSdk.restoreBehavior = 'fail';
    await renderSettings();
    await waitFor(() => expect(latest.status).toBe('free'));

    await pressRestore();

    expect(nativeSdk.restoreCount).toBe(1);
    expect(latest.status).toBe('free');
  });

  it('a restore the store accepts but GET me does not confirm leaves the user free', async () => {
    nativeSdk.restoreBehavior = 'no-grant';
    await renderSettings();
    await waitFor(() => expect(latest.status).toBe('free'));

    await pressRestore();

    const restoreAt = fakeServer.events.indexOf('restorePurchases');
    expect(restoreAt).toBeGreaterThanOrEqual(0);
    await waitFor(() => expect(fakeServer.events.slice(restoreAt + 1)).toContain('GET me'));
    await settle();
    expect(latest.status).toBe('free');
  });
});
