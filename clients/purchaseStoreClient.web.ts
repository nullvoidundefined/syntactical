// The web store behind the paywall, through the Web Billing wrapper. Web
// Billing purchases belong to the signed-in account, so there is nothing to restore.
import type { WebPurchaseOutcome } from './types/WebPurchaseOutcome';
import { purchaseWebBillingProduct, readWebBillingPrices } from './webBillingClient';

export function readStorePrices(): Promise<Record<string, string>> {
  return readWebBillingPrices();
}

export function buyStoreProduct(productId: string): Promise<WebPurchaseOutcome> {
  return purchaseWebBillingProduct(productId);
}

export function restoreStorePurchases(): Promise<boolean> {
  return Promise.resolve(false);
}
