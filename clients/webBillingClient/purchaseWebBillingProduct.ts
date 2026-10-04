// A purchase of the package whose Web Billing product identifier is the bank's
// product id.
import { ErrorCode, PurchasesError } from '@revenuecat/purchases-js';

import { logWarning } from '../logClient';
import type { WebPurchaseOutcome } from '../types/WebPurchaseOutcome';

import { webBillingState } from './webBillingState';

export async function purchaseWebBillingProduct(productId: string): Promise<WebPurchaseOutcome> {
  const current = webBillingState.current;
  if (current === null) return 'unavailable';
  try {
    const offerings = await current.instance.getOfferings();
    const rcPackage = offerings.current?.availablePackages.find(
      (candidate) => candidate.webBillingProduct.identifier === productId,
    );
    if (rcPackage === undefined || webBillingState.current !== current) return 'unavailable';
    await current.instance.purchase({ rcPackage });
    return 'purchased';
  } catch (error) {
    if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) {
      return 'cancelled';
    }
    // Fixed error and message: the SDK's own error can carry the product or user id.
    logWarning({ err: new Error('web billing purchase failed') }, 'web purchase unavailable');
    return 'unavailable';
  }
}
