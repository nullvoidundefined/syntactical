// Web Billing's page where the signed-in customer manages or cancels a subscription, from the
// configured instance's CustomerInfo.managementURL. Null when Web Billing is not configured, when
// RevenueCat reports none, or when the read fails, so a caller shows no link rather than a guess.
import { logWarning } from '../logClient';

import { webBillingState } from './webBillingState';

export async function readWebBillingManagementUrl(): Promise<string | null> {
  const current = webBillingState.current;
  if (current === null) return null;
  try {
    return (await current.instance.getCustomerInfo()).managementURL ?? null;
  } catch {
    logWarning({ err: new Error('web billing customer info unavailable') }, 'web management url unavailable');
    return null;
  }
}
