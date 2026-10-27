// Web Billing's page where the signed-in customer manages or cancels a subscription, from the
// configured instance's CustomerInfo.managementURL. Null when Web Billing is not configured or
// RevenueCat reports none, so a caller shows no link rather than a guess; a failed read rejects, so
// the caller's query can read again later instead of caching "no page".
import { logWarning } from '../logClient';

import { webBillingState } from './webBillingState';

export async function readWebBillingManagementUrl(): Promise<string | null> {
  const current = webBillingState.current;
  if (current === null) return null;
  try {
    return (await current.instance.getCustomerInfo()).managementURL ?? null;
  } catch {
    const err = new Error('web billing customer info unavailable');
    logWarning({ err }, 'web management url unavailable');
    throw err;
  }
}
