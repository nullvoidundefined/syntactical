// Removes a key from AsyncStorage entirely, reporting success as a boolean and
// logging (never throwing) when storage is unavailable. The key is never logged:
// a stats key embeds a user id.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logWarning } from './logClient';

export async function removeStoredKey(key: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (err) {
    logWarning({ err: String(err) }, 'storage remove failed');
    return false;
  }
}
