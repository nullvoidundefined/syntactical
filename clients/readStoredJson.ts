// Reads a JSON value from AsyncStorage for a caller that must tell "nothing
// stored" from "could not read": an absent key reads as null, a read that
// throws is reported as failed and logged, and text that is not JSON is
// returned as the raw string, so the caller's type guard rejects it rather
// than treating the key as empty.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logWarning } from './logClient';
import type { StoredRead } from './types/StoredRead';

function parseStoredText(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    logWarning({ err }, 'stored value is not JSON, keeping the raw text');
    return raw;
  }
}

export async function readStoredJson(key: string): Promise<StoredRead> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return { isReadFailed: false, value: raw === null ? null : parseStoredText(raw) };
  } catch (err) {
    logWarning({ err, key }, 'storage read failed, keeping changes in memory');
    return { isReadFailed: true, value: null };
  }
}
