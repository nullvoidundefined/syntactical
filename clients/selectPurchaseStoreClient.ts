// The store behind usePurchases, chosen at call time: the fixture store when the build's API base
// URL is an http loopback URL (only the e2e build can carry one; app.config.ts refuses it
// elsewhere), else the platform's real store. The fixture is required inside that branch and never
// imported statically (scripts/__tests__/noFixtureInProduction.test.ts). Metro still bundles it,
// because it collects every literal require; it is never selected outside a loopback API URL.
// hasCheckoutRedirect says a finished purchase returns through /purchase-complete (Web Billing
// checkout) instead of being confirmed in place.
import { Platform } from 'react-native';

import { readExtraString } from '../config/readExtraString';

import { isLoopbackUrl } from './isLoopbackUrl';
import * as platformStore from './purchaseStoreClient';
import type { PurchaseStoreClient } from './types/PurchaseStoreClient';

// Loaded only when called, so the fixture's module code runs only under a loopback API URL.
function requireFixtureStore(): PurchaseStoreClient {
  return require('./purchaseStoreClient.fixture') as PurchaseStoreClient;
}

export type SelectedStore = { client: PurchaseStoreClient; hasCheckoutRedirect: boolean };

export function selectPurchaseStoreClient(): SelectedStore {
  if (isLoopbackUrl(readExtraString('apiBaseUrl'))) {
    return { client: requireFixtureStore(), hasCheckoutRedirect: false };
  }
  return { client: platformStore, hasCheckoutRedirect: Platform.OS === 'web' };
}
