// Holds the native session value in the platform secure store. The web build
// relies on an HttpOnly cookie, so every web operation is a no-op; the value
// is never written to AsyncStorage.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_TOKEN_KEY = 'syntactical.session-token';

export async function readSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function writeSessionToken(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, value);
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
