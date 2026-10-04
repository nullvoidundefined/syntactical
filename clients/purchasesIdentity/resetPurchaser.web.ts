// Web purchaser reset: Web Billing is closed on sign-out. Never throws; a
// failure logs a fixed error with no value.
import { logWarning } from '../logClient';
import { resetWebBilling } from '../webBillingClient';

export async function resetPurchaser(): Promise<void> {
  try {
    resetWebBilling();
  } catch {
    logWarning({ err: new Error('web billing reset failed') }, 'purchaser reset failed');
  }
}
