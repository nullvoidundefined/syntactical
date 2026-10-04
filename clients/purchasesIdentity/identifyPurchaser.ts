// Native purchaser identity: configures react-native-purchases with the
// platform's public key when it is not yet configured, then logs in with the
// server user id. Never throws.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

import { enqueuePurchaserCall } from './enqueuePurchaserCall';

function readPlatformKey(): string | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const { revenueCatAppleKey, revenueCatGoogleKey } = extra ?? {};
  let key: unknown;
  if (Platform.OS === 'ios') key = revenueCatAppleKey;
  else if (Platform.OS === 'android') key = revenueCatGoogleKey;
  return typeof key === 'string' && key !== '' ? key : null;
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
