// Writes a JSON value to AsyncStorage, reporting success as a boolean and
// logging (never throwing) when storage is unavailable.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logWarning } from './logClient';

export async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    logWarning({ err: String(err), key }, 'storage write failed');
    return false;
  }
}
