// Reads the native session value from the platform secure store; the web build
// relies on an HttpOnly cookie, so it reads null there.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { SESSION_TOKEN_KEY } from './sessionTokenKey';

export async function readSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}
