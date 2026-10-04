// Web purchaser identity: Web Billing is configured with the server user id.
// Never throws; a failure logs a fixed error with no value.
import { logWarning } from '../logClient';
import { configureWebBilling } from '../webBillingClient';

export async function identifyPurchaser(userId: string): Promise<void> {
  try {
    configureWebBilling(userId);
  } catch {
    logWarning({ err: new Error('web billing configure failed') }, 'purchaser identify failed');
  }
}
