// The fixture store for the e2e build, chosen only when the API base URL is an http loopback URL
// (clients/selectPurchaseStoreClient.ts) and never imported statically
// (scripts/__tests__/noFixtureInProduction.test.ts). Prices are fixed. A purchase posts a
// synthetic RevenueCat event for the signed-in user to the test-mode POST /v1/test/webhook, so the
// server's real webhook handling grants Pro and GET /me reports it, as a store purchase would; the
// app still confirms only through GET /me. A restore finishes with nothing to add (true, so the
// app asks GET /me, which decides).
import { HTTP_STATUS_OK } from '../constants/appConfig';
import { PRO_PRODUCT_IDS } from '../constants/proProducts';

import { apiFetch } from './apiClient';
import type { WebPurchaseOutcome } from './types/WebPurchaseOutcome';
import { generateUuid } from './uuidClient';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const FIXTURE_PRICES: Readonly<Record<string, string>> = {
  [PRO_PRODUCT_IDS.ANNUAL]: '$19.99',
  [PRO_PRODUCT_IDS.LIFETIME]: '$39.99',
};

export function readStorePrices(): Promise<Record<string, string>> {
  return Promise.resolve({ ...FIXTURE_PRICES });
}

function buildEvent(productId: string, appUserId: string): Record<string, string | number> {
  const now = Date.now();
  const isAnnual = productId === PRO_PRODUCT_IDS.ANNUAL;
  return {
    app_user_id: appUserId,
    event_timestamp_ms: now,
    id: `fixture-${generateUuid()}`,
    product_id: productId,
    store: 'APP_STORE',
    type: isAnnual ? 'INITIAL_PURCHASE' : 'NON_RENEWING_PURCHASE',
    ...(isAnnual ? { expiration_at_ms: now + ONE_YEAR_MS } : {}),
  };
}

export async function buyStoreProduct(productId: string, appUserId: string | null): Promise<WebPurchaseOutcome> {
  if (appUserId === null || !Object.hasOwn(FIXTURE_PRICES, productId)) return 'unavailable';
  try {
    const { status } = await apiFetch('test/webhook', {
      body: { event: buildEvent(productId, appUserId) },
      method: 'POST',
    });
    return status === HTTP_STATUS_OK ? 'purchased' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export function restoreStorePurchases(): Promise<boolean> {
  return Promise.resolve(true);
}
