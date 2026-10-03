// Reads the guest claim marker: null when none is stored or the stored value
// is not a marker.
import { readStoredJson } from '../../clients/readStoredJson';
import { GUEST_CLAIM_STORAGE_KEY } from '../../constants/appConfig';

import type { GuestClaimMarker } from './types/GuestClaimMarker';

export async function readGuestClaimMarker(): Promise<GuestClaimMarker | null> {
  const { value } = await readStoredJson(GUEST_CLAIM_STORAGE_KEY);
  if (typeof value !== 'object' || value === null) return null;
  const { folded, userId } = value as Partial<GuestClaimMarker>;
  return typeof userId === 'string' && typeof folded === 'boolean' ? { folded, userId } : null;
}
