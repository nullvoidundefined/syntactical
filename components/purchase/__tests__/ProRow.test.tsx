// components/purchase/__tests__/ProRow.test.tsx
// The Settings Pro row on native (iOS under Jest), with the real useProStatus, ProOffer, ProSheet,
// usePurchases, and the native store client; GET me, the SDK, auth, the router, and analytics are
// fakes:
// - a guest sees nothing and sends no GET me;
// - a free user sees "Go Pro", which opens the Pro sheet with source settings; buying the annual
//   there closes the sheet and the row then reads "Pro until <date>";
// - an annual subscriber reads "Pro until <date>" and gets "Manage subscription", which opens the
//   managementURL RevenueCat's CustomerInfo gives; with no managementURL there is no link;
// - a lifetime owner reads "Pro, lifetime" with no "Manage subscription" when RevenueCat gives none.
import { randomBytes } from 'node:crypto';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import '../../auth/__tests__/preloadNativeModal';
import { setExpoExtra } from '../../../config/expoConstantsMock';
import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { ProRow } from '../ProRow';

import {
  ANNUAL_EXPIRES_AT,
  ANNUAL_PRODUCT,
  LIFETIME_PRODUCT,
  NATIVE_PRICES,
  SIGNED_IN_USER,
  buildActivePro,
  countMeRequests,
  fakeAuth,
  fakeServer,
  nativeSdk,
  resetFakes,
  serveApp,
} from './purchaseFlowFakes';

const mockTrackEvent = jest.fn();

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
jest.mock('react-native-purchases', () => require('./purchaseFlowFakes').buildNativePurchasesModule());
jest.mock('../../../state/AuthProvider', () => require('./purchaseFlowFakes').buildAuthModule());
jest.mock('expo-router', () => require('./purchaseFlowFakes').buildRouterModule(() => ({})));
jest.mock('../../../clients/analyticsClient', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

// What RevenueCat reports for an App Store subscriber; the app never spells a store URL itself.
const APP_STORE_MANAGEMENT_URL = 'https://apps.apple.com/account/subscriptions';
const PRO_UNTIL = `Pro until ${new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(ANNUAL_EXPIRES_AT))}`;

let queryClient: QueryClient;

async function renderRow(): Promise<void> {
  await render(
    <QueryClientProvider client={queryClient}>
      <ProRow />
    </QueryClientProvider>,
  );
  await settle();
}

beforeEach(() => {
  resetFakes();
  fakeAuth.userId = SIGNED_IN_USER;
  queryClient = createQueryClient();
  mockTrackEvent.mockReset();
  serveApp();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('ProRow on native', () => {
  it('shows a guest nothing and sends no GET me', async () => {
    fakeAuth.userId = null;
    await renderRow();
    expect(screen.queryByRole('button', { name: 'Go Pro' })).toBeNull();
    expect(screen.queryByText(/^Pro/)).toBeNull();
    expect(countMeRequests()).toBe(0);
  });

  it('offers a free user "Go Pro", which opens the Pro sheet from settings', async () => {
    await renderRow();
    await fireEvent.press(await screen.findByRole('button', { name: 'Go Pro' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Syntactical Pro')).toBeTruthy();
    expect(mockTrackEvent).toHaveBeenCalledWith('paywall_viewed', { source: 'settings' });
  });

  it('closes the sheet after an annual purchase the server confirms, and then reads "Pro until <date>"', async () => {
    await renderRow();
    await fireEvent.press(await screen.findByRole('button', { name: 'Go Pro' }));
    const dialog = await screen.findByRole('dialog');
    await fireEvent.press(within(dialog).getByRole('button', { name: `A year for ${NATIVE_PRICES[ANNUAL_PRODUCT]}` }));
    await settle();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(PRO_UNTIL)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Go Pro' })).toBeNull();
  });

  it('shows an annual subscriber "Pro until <date>" and a Manage subscription link to RevenueCat\'s managementURL', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    fakeServer.pro = buildActivePro(ANNUAL_PRODUCT);
    nativeSdk.managementUrl = APP_STORE_MANAGEMENT_URL;
    await renderRow();
    expect(await screen.findByText(PRO_UNTIL)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Go Pro' })).toBeNull();
    await fireEvent.press(await screen.findByRole('link', { name: 'Manage subscription' }));
    expect(openURL).toHaveBeenCalledWith(APP_STORE_MANAGEMENT_URL);
  });

  it('shows an annual subscriber no Manage subscription link when RevenueCat gives no managementURL', async () => {
    fakeServer.pro = buildActivePro(ANNUAL_PRODUCT);
    await renderRow();
    expect(await screen.findByText(PRO_UNTIL)).toBeTruthy();
    await settle();
    expect(screen.queryByRole('link', { name: 'Manage subscription' })).toBeNull();
  });

  it('shows a lifetime owner "Pro, lifetime" with no Manage subscription link', async () => {
    fakeServer.pro = buildActivePro(LIFETIME_PRODUCT);
    await renderRow();
    expect(await screen.findByText('Pro, lifetime')).toBeTruthy();
    await settle();
    expect(screen.queryByRole('link', { name: 'Manage subscription' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Go Pro' })).toBeNull();
  });
});
