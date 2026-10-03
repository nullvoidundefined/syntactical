// Thin wrapper around expo-crypto: a cryptographically random UUID v4, the
// client-generated id of each answer event.
import { randomUUID } from 'expo-crypto';

export function generateUuid(): string {
  return randomUUID();
}
