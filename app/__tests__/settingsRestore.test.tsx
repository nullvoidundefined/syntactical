// Task 3.18 (B-43) on native, narrowed in area 2 once banks stopped being locked: Settings offers
// "Restore purchases" to a signed-in user; it calls react-native-purchases' restorePurchases, then
// GET me. A failed restore, or one GET me does not confirm, grants nothing. Area 4 rewrites restore
// for Pro.
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
import { createQueryClient } from '../../config/queryClient';
import SettingsScreen from '../settings';
import { randomBytes } from 'node:crypto';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { settle } from '../../config/settle';

const mockParams: { current: Record<string, string | string[] | undefined> } = {
  current: { language: 'python' },
};

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
jest.mock('../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));
jest.mock('react-native-purchases', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildNativePurchasesModule(),
);
jest.mock('../../state/AuthProvider', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);
jest.mock('expo-router', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildRouterModule(() => mockParams.current),
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

let queryClient: QueryClient;

async function renderSettings(): Promise<void> {
  await render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreen />
    </QueryClientProvider>,
  );
  await settle();
}

beforeEach(() => {
  resetFakes();
  queryClient = createQueryClient();
  fakeAuth.userId = SIGNED_IN_USER;
  serveApp();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('Restore purchases in Settings on native', () => {
  it('calls restorePurchases, then GET me', async () => {
    await renderSettings();
    const meBefore = countMeRequests();

    await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
    await settle();

    expect(nativeSdk.restoreCount).toBe(1);
    await waitFor(() => expect(countMeRequests()).toBeGreaterThan(meBefore));
    const restoreAt = fakeServer.events.indexOf('restorePurchases');
    expect(fakeServer.events.slice(restoreAt + 1)).toContain('GET me');
  });

  it('a failed restore grants nothing', async () => {
    nativeSdk.restoreBehavior = 'fail';
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
    await settle();

    expect(nativeSdk.restoreCount).toBe(1);
    expect(fakeServer.entitlements).toEqual([]);
  });

  it('a restore the store accepts but GET me does not confirm grants nothing', async () => {
    nativeSdk.restoreBehavior = 'no-grant';
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
    await settle();

    expect(nativeSdk.restoreCount).toBe(1);
    const restoreAt = fakeServer.events.indexOf('restorePurchases');
    await waitFor(() => expect(fakeServer.events.slice(restoreAt + 1)).toContain('GET me'));
    expect(fakeServer.entitlements).toEqual([]);
  });
});
