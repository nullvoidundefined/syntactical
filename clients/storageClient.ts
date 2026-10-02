// Thin wrapper around AsyncStorage: JSON (de)serialization and defensive
// handling of unavailable or corrupt storage. On the web AsyncStorage is
// backed by localStorage, so keys written by the old Vite build carry over.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logWarning } from './logClient';

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    logWarning({ key, err: String(err) }, 'storage write failed');
    return false;
  }
}
