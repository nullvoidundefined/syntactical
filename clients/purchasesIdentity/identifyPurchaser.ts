// Native purchaser identity: configures react-native-purchases with the
// platform's public key when it is not yet configured, then logs in with the
// server user id. Never throws.
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

import { readExtraString } from '../../config/readExtraString';

import { enqueuePurchaserCall } from './enqueuePurchaserCall';

function readPlatformKey(): string | null {
  if (Platform.OS === 'ios') return readExtraString('revenueCatAppleKey');
  if (Platform.OS === 'android') return readExtraString('revenueCatGoogleKey');
  return null;
}

export function identifyPurchaser(userId: string): Promise<void> {
  return enqueuePurchaserCall(async () => {
    if (!(await Purchases.isConfigured())) {
      const key = readPlatformKey();
      if (key === null) return;
      Purchases.configure({ apiKey: key });
    }
    await Purchases.logIn(userId);
  }, 'purchaser identify failed');
}
