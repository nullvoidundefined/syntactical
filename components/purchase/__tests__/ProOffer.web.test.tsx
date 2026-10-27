// components/purchase/__tests__/ProOffer.web.test.tsx
// The Pro offer on the web, with the real ProSheet, usePurchases, and the Web Billing store
// client; Web Billing, the server, auth, the router, and analytics are fakes: the buttons carry
// the Web Billing offering's prices; a purchase goes through purchaseWebBillingProduct and then to
// /purchase-complete for that product, closing the sheet without deciding Pro itself; a cancelled
// purchase goes nowhere and says nothing; an unavailable one goes nowhere and says it did not go through.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { setExpoExtra } from '../../../config/expoConstantsMock';
import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { ProOffer } from '../ProOffer';

import {
  ANNUAL_PRODUCT,
  LIFETIME_PRODUCT,
  SIGNED_IN_USER,
  WEB_PRICES,
  fakeAuth,
  listNavigatedUrls,
  resetFakes,
  serveApp,
  webBilling,
} from './purchaseFlowFakes';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/', contentBaseUrl: 'https://example.test/content/' });
jest.mock('../../../clients/webBillingClient', () => require('./purchaseFlowFakes').buildWebBillingModule());
jest.mock('../../../state/AuthProvider', () => require('./purchaseFlowFakes').buildAuthModule());
jest.mock('expo-router', () => require('./purchaseFlowFakes').buildRouterModule(() => ({})));
jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => true }));
jest.mock('../../../clients/analyticsClient', () => ({ trackEvent: () => undefined }));

const ANNUAL_BUTTON = `A year for ${WEB_PRICES[ANNUAL_PRODUCT]}`;
const LIFETIME_BUTTON = `Forever for ${WEB_PRICES[LIFETIME_PRODUCT]}`;
const PURCHASE_FAILED = 'The purchase did not go through. Try again.';

let queryClient: QueryClient;
let onClose: jest.Mock;

async function renderOffer(): Promise<HTMLElement> {
  render(
    <QueryClientProvider client={queryClient}>
      <ProOffer onClose={onClose} source="ask_limit" />
    </QueryClientProvider>,
  );
  await settle();
  await screen.findByRole('button', { name: ANNUAL_BUTTON });
  return screen.getByRole('dialog', { name: 'Syntactical Pro' });
}

async function press(dialog: HTMLElement, name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name }));
  });
  await settle();
}

function listPurchaseCompleteUrls(): URL[] {
  return listNavigatedUrls().filter(({ pathname }) => pathname === '/purchase-complete');
}

beforeEach(() => {
  resetFakes();
  fakeAuth.userId = SIGNED_IN_USER;
  queryClient = createQueryClient();
  onClose = jest.fn();
  serveApp();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('ProOffer on the web', () => {
  it('names both buttons with the Web Billing offering prices', async () => {
    const dialog = await renderOffer();
    expect(within(dialog).getByRole('button', { name: LIFETIME_BUTTON })).toBeTruthy();
  });

  it.each([
    [ANNUAL_BUTTON, ANNUAL_PRODUCT],
    [LIFETIME_BUTTON, LIFETIME_PRODUCT],
  ])(
    '"%s" buys through Web Billing, then goes to /purchase-complete for that product and closes',
    async (button, productId) => {
      const dialog = await renderOffer();
      await press(dialog, button);
      expect(webBilling.purchasedProductIds).toEqual([productId]);
      await waitFor(() => expect(listPurchaseCompleteUrls()).toHaveLength(1));
      expect(listPurchaseCompleteUrls()[0].searchParams.get('product')).toBe(productId);
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );

  it('a cancelled purchase goes nowhere, says nothing, and stays open', async () => {
    webBilling.purchaseBehavior = 'cancelled';
    const dialog = await renderOffer();
    await press(dialog, ANNUAL_BUTTON);
    expect(listPurchaseCompleteUrls()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('an unavailable purchase goes nowhere and says it did not go through', async () => {
    webBilling.purchaseBehavior = 'unavailable';
    const dialog = await renderOffer();
    await press(dialog, ANNUAL_BUTTON);
    expect(listPurchaseCompleteUrls()).toEqual([]);
    expect(await screen.findByText(PURCHASE_FAILED)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
