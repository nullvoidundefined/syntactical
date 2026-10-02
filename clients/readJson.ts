// Reads a JSON value from AsyncStorage, returning the fallback when the key
// is absent, the stored text is corrupt, or storage is unavailable. On the
// web AsyncStorage is backed by localStorage, so keys written by the old
// Vite build carry over.
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
