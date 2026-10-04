// Removes a key from AsyncStorage, reporting success as a boolean and logging
// (never throwing) when storage is unavailable.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logWarning } from './logClient';

export async function removeStoredKey(key: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (err) {
    logWarning({ err: String(err), key }, 'storage remove failed');
    return false;
  }
}
