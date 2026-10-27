// components/purchase/__tests__/ProOffer.test.tsx
// The Pro offer on native, with the real ProSheet, usePurchases, useProStatus, and the native
// store client; the SDK, the server (a routed fetch), auth, the router, and analytics are fakes:
// - the buttons carry the store's localized prices, or none when the offering cannot be read;
// - "A year" or "Forever" buys that package through purchasePackage, then asks GET me, and closes
//   the sheet only once the server says Pro is active;
// - a cancelled purchase says nothing; a failed one says it did not go through; one the server has
//   not confirmed says it is still processing, keeps the sheet open (the SDK's own success is not
//   believed), and re-checks GET me on its own, closing once the server says Pro;
// - signing out closes it; a guest sees nothing and the SDK is never called.
import { randomBytes } from 'node:crypto';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import '../../auth/__tests__/preloadNativeModal';
import { setExpoExtra } from '../../../config/expoConstantsMock';
import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { ProOffer } from '../ProOffer';

import {
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

const ANNUAL_BUTTON = `A year for ${NATIVE_PRICES[ANNUAL_PRODUCT]}`;
const LIFETIME_BUTTON = `Forever for ${NATIVE_PRICES[LIFETIME_PRODUCT]}`;
const PURCHASE_FAILED = 'The purchase did not go through. Try again.';
const PURCHASE_PENDING = 'Your purchase is still processing. Check back shortly.';
const HIDDEN = { includeHiddenElements: true };

let queryClient: QueryClient;
let onClose: jest.Mock;
// True while a test runs on jest's fake clock; afterEach then restores the real one.
let isFakeClock = false;

function buildTree() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProOffer onClose={onClose} source="settings" />
    </QueryClientProvider>
  );
}

async function renderOffer() {
  const rendered = await render(buildTree());
  await settle();
  return rendered;
}

async function pressInDialog(name: string): Promise<void> {
  const dialog = await screen.findByRole('dialog');
  await fireEvent.press(within(dialog).getByRole('button', { name }));
  await settle();
}

function readSdk() {
  return require('react-native-purchases').default as Record<string, jest.Mock>;
}

beforeEach(() => {
  resetFakes();
  fakeAuth.userId = SIGNED_IN_USER;
  queryClient = createQueryClient();
  onClose = jest.fn();
  mockTrackEvent.mockReset();
  serveApp();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  if (isFakeClock) {
    jest.useRealTimers();
    isFakeClock = false;
  }
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('ProOffer on native', () => {
  it("names the buttons with the store's localized prices and records paywall_viewed once with its source", async () => {
    await renderOffer();
    expect(await screen.findByRole('button', { name: ANNUAL_BUTTON })).toBeTruthy();
    expect(screen.getByRole('button', { name: LIFETIME_BUTTON })).toBeTruthy();
    expect(mockTrackEvent.mock.calls.filter(([name]) => name === 'paywall_viewed')).toEqual([
      ['paywall_viewed', { source: 'settings' }],
    ]);
  });

  it('names the buttons without a price, never a hard-coded one, when the offering cannot be read', async () => {
    nativeSdk.offeringsError = new Error('offerings unavailable');
    await renderOffer();
    expect(await screen.findByRole('button', { name: 'A year' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forever' })).toBeTruthy();
    expect(screen.queryByText(/\$\s?(19|39)/)).toBeNull();
  });

  it.each([
    [ANNUAL_BUTTON, ANNUAL_PRODUCT, 'annual'],
    [LIFETIME_BUTTON, LIFETIME_PRODUCT, 'lifetime'],
  ])('"%s" buys that package, asks GET me, and closes once the server says Pro', async (button, productId, plan) => {
    await renderOffer();
    await screen.findByRole('button', { name: button });
    const meBefore = countMeRequests();
    await pressInDialog(button);
    expect(nativeSdk.purchasedProductIds).toEqual([productId]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledWith('unlocked');
    expect(countMeRequests()).toBeGreaterThan(meBefore);
    const purchaseAt = fakeServer.events.indexOf(`purchasePackage ${productId}`);
    expect(fakeServer.events.slice(purchaseAt + 1)).toContain('GET me');
    expect(mockTrackEvent).toHaveBeenCalledWith('pro_purchased', { product: plan });
  });

  it('says nothing and stays open after a cancelled purchase', async () => {
    nativeSdk.purchaseBehavior = 'cancel';
    await renderOffer();
    await screen.findByRole('button', { name: ANNUAL_BUTTON });
    await pressInDialog(ANNUAL_BUTTON);
    expect(nativeSdk.purchasedProductIds).toEqual([ANNUAL_PRODUCT]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says the purchase did not go through after a failed purchase, and stays open', async () => {
    nativeSdk.purchaseBehavior = 'fail';
    await renderOffer();
    await screen.findByRole('button', { name: ANNUAL_BUTTON });
    await pressInDialog(ANNUAL_BUTTON);
    expect(await screen.findByText(PURCHASE_FAILED)).toBeTruthy();
    expect(screen.queryByText(PURCHASE_PENDING)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("security boundary: the SDK's own success with no server grant keeps the sheet open and says it is processing", async () => {
    nativeSdk.purchaseBehavior = 'no-grant';
    await renderOffer();
    await screen.findByRole('button', { name: ANNUAL_BUTTON });
    const meBefore = countMeRequests();
    await pressInDialog(ANNUAL_BUTTON);
    await waitFor(() => expect(countMeRequests()).toBeGreaterThan(meBefore));
    expect(await screen.findByText(PURCHASE_PENDING)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalledWith('pro_purchased', expect.anything());
  });

  it('after a pending purchase, re-checks GET me on its own and closes once the server says Pro', async () => {
    jest.useFakeTimers();
    isFakeClock = true;
    nativeSdk.purchaseBehavior = 'no-grant';
    await renderOffer();
    await screen.findByRole('button', { name: ANNUAL_BUTTON });
    await pressInDialog(ANNUAL_BUTTON);
    await settle();
    expect(await screen.findByText(PURCHASE_PENDING, HIDDEN)).toBeTruthy();

    // The RevenueCat webhook reaches the server after the purchase returned.
    fakeServer.pro = buildActivePro(ANNUAL_PRODUCT);
    const meAfterPurchase = countMeRequests();
    for (let elapsed = 0; elapsed < 5000; elapsed += 250) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
    }

    expect(countMeRequests()).toBeGreaterThan(meAfterPurchase);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('unlocked');
  });

  it('closes when the user signs out while it is open, leaving no buy button', async () => {
    const rendered = await renderOffer();
    await screen.findByRole('button', { name: ANNUAL_BUTTON });
    fakeAuth.userId = null;
    await rendered.rerender(buildTree());
    await settle();
    expect(onClose).toHaveBeenCalledWith('closed');
    expect(screen.queryByRole('button', { name: /^A year/, ...HIDDEN })).toBeNull();
    expect(nativeSdk.purchasedProductIds).toEqual([]);
  });

  it('renders nothing for a guest and never calls the SDK', async () => {
    fakeAuth.userId = null;
    await renderOffer();
    expect(screen.queryByRole('dialog', HIDDEN)).toBeNull();
    expect(readSdk().getOfferings.mock.calls).toHaveLength(0);
    expect(readSdk().purchasePackage.mock.calls).toHaveLength(0);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});
