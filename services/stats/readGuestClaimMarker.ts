// Reads the guest claim marker: null when none is stored, the stored value is
// not a marker, or it is a folded marker without a valid snapshot (stale, so
// it is never used to reset guest stats).
import { readStoredJson } from '../../clients/readStoredJson';
import { GUEST_CLAIM_STORAGE_KEY } from '../../constants/appConfig';

import type { GuestClaimMarker } from './types/GuestClaimMarker';

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function readGuestClaimMarker(): Promise<GuestClaimMarker | null> {
  const { value } = await readStoredJson(GUEST_CLAIM_STORAGE_KEY);
  if (typeof value !== 'object' || value === null) return null;
  const { folded, snapshot, userId } = value as Partial<GuestClaimMarker>;
  if (typeof userId !== 'string' || typeof folded !== 'boolean') return null;
  if (typeof snapshot !== 'object' || snapshot === null) return folded ? null : { folded, userId };
  const { attempted, correct } = snapshot;
  if (!isCount(attempted) || !isCount(correct)) return folded ? null : { folded, userId };
  return { folded, snapshot: { attempted, correct }, userId };
}
