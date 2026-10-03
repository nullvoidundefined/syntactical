// Deletes the native session value from the platform secure store; a no-op on web.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { SESSION_TOKEN_KEY } from './sessionTokenKey';

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
