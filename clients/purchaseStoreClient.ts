// The native store behind the paywall, through react-native-purchases. Prices
// are the store's own localized strings. A purchase or restore result only says
// the store call finished; it never says a bank is owned (GET /me does).
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { logWarning } from './logClient';
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
    for (const { product } of await readPackages()) prices[product.identifier] = product.priceString;
    return prices;
  } catch {
    logWarning({ err: new Error('store prices unavailable') }, 'store prices unavailable');
    return {};
  }
}

export async function buyStoreProduct(productId: string): Promise<WebPurchaseOutcome> {
  try {
    const rcPackage = (await readPackages()).find(({ product }) => product.identifier === productId);
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
