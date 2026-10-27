// The native store behind the Pro sheet, through react-native-purchases. Prices are the store's
// own localized strings, keyed by the app's product id: a Play subscription's identifier carries
// its base plan (syntactical.pro.annual:yearly), so every store identifier goes through
// normalizeProductId before it is compared or used as a key. A purchase or restore result only
// says the store call finished; it never says Pro is active (GET /me does).
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { logWarning } from './logClient';
import { normalizeProductId } from './normalizeProductId';
import { purchaserQueue } from './purchasesIdentity/purchaserQueue';
import type { WebPurchaseOutcome } from './types/WebPurchaseOutcome';

async function readPackages(): Promise<PurchasesPackage[]> {
  // The identity call configures the SDK; wait for it before reading offerings.
  await purchaserQueue.tail;
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function readStorePrices(): Promise<Record<string, string>> {
  try {
    const prices: Record<string, string> = {};
    for (const { product } of await readPackages())
      prices[normalizeProductId(product.identifier)] = product.priceString;
    return prices;
  } catch {
    logWarning({ err: new Error('store prices unavailable') }, 'store prices unavailable');
    return {};
  }
}

export async function buyStoreProduct(productId: string): Promise<WebPurchaseOutcome> {
  try {
    const rcPackage = (await readPackages()).find(
      ({ product }) => normalizeProductId(product.identifier) === productId,
    );
    if (rcPackage === undefined) return 'unavailable';
    await Purchases.purchasePackage(rcPackage);
    return 'purchased';
  } catch (error) {
    if ((error as { userCancelled?: unknown } | null)?.userCancelled === true) return 'cancelled';
    // Fixed error and message: the SDK's own error can carry the product or user id.
    logWarning({ err: new Error('store purchase failed') }, 'store purchase unavailable');
    return 'unavailable';
  }
}

// True when the store restored; the caller then asks the server what is owned.
export async function restoreStorePurchases(): Promise<boolean> {
  try {
    await Purchases.restorePurchases();
    return true;
  } catch {
    logWarning({ err: new Error('store restore failed') }, 'store restore unavailable');
    return false;
  }
}

// The store's page for managing this purchaser's subscription (App Store or Google Play), from
// RevenueCat's CustomerInfo.managementURL; null when RevenueCat reports none. A failed read
// rejects, so the caller's query can read again later instead of caching "no page".
export async function readManagementUrl(): Promise<string | null> {
  try {
    // The identity call configures the SDK; wait for it before reading customer info.
    await purchaserQueue.tail;
    return (await Purchases.getCustomerInfo()).managementURL ?? null;
  } catch {
    const err = new Error('store customer info unavailable');
    logWarning({ err }, 'store management url unavailable');
    throw err;
  }
}
