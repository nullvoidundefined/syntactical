// Validates the stored identity: an object with a string-or-null userId and
// an array of string user ids. Anything else resolves to null so the caller
// starts signed out.
type StoredAuth = { knownUserIds: string[]; userId: string | null };

export function resolveStoredAuth(value: unknown): StoredAuth | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { knownUserIds, userId } = value as Record<string, unknown>;
  const isUserIdValid = userId === null || typeof userId === 'string';
  const isKnownValid =
    Array.isArray(knownUserIds) && knownUserIds.every((id) => typeof id === 'string');
  if (!isUserIdValid || !isKnownValid) {
    return null;
  }
  return { knownUserIds: knownUserIds as string[], userId: userId as string | null };
}
