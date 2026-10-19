// Configures one Web Billing instance per signed-in user, with the public rcb_
// key from extra (a missing or other key configures nothing), closing any
// instance for another user first.
import { Purchases } from '@revenuecat/purchases-js';

import { readExtraString } from '../../config/readExtraString';

import { resetWebBilling } from './resetWebBilling';
import { webBillingState } from './webBillingState';

const WEB_BILLING_KEY_PATTERN = /^rcb_[A-Za-z0-9_.-]+$/;

function readWebBillingKey(): string | null {
  const key = readExtraString('revenueCatWebBillingKey');
  return key !== null && WEB_BILLING_KEY_PATTERN.test(key) ? key : null;
}

export function configureWebBilling(appUserId: string): void {
  const apiKey = readWebBillingKey();
  if (apiKey === null) return;
  if (webBillingState.current?.userId === appUserId) return;
  resetWebBilling();
  webBillingState.current = {
    instance: Purchases.configure({ apiKey, appUserId }),
    userId: appUserId,
  };
}
