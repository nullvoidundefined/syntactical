// Closes the Web Billing instance, if any, and clears it.
import { webBillingState } from './webBillingState';

export function resetWebBilling(): void {
  const current = webBillingState.current;
  webBillingState.current = null;
  try {
    current?.instance.close();
  } catch {
    // A close that throws must not stop the next user's configuration.
  }
}
