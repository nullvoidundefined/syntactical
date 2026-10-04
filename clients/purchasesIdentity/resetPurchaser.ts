// Native purchaser reset: logs out of react-native-purchases on sign-out when
// it is configured. Never throws.
import Purchases from 'react-native-purchases';

import { enqueuePurchaserCall } from './enqueuePurchaserCall';

export function resetPurchaser(): Promise<void> {
  return enqueuePurchaserCall(async () => {
    if (await Purchases.isConfigured()) await Purchases.logOut();
  }, 'purchaser reset failed');
}
