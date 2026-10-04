// Writes the native session value to the platform secure store; a no-op on web.
// The value is never written to AsyncStorage.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { SESSION_TOKEN_KEY } from './sessionTokenKey';

export async function writeSessionToken(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, value);
}
