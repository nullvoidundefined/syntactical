// Builds a product entry from the source of a granted entitlement (undefined when not granted).
import type { AdminProductEntry } from '../types/AdminProductEntry.js';

function toAdminProductEntry(productId: string, grantedSource: string | undefined): AdminProductEntry {
  if (grantedSource === undefined) {
    return { grantSource: null, isGranted: false, productId };
  }
  return { grantSource: grantedSource === 'admin' ? 'admin' : 'purchase', isGranted: true, productId };
}

export { toAdminProductEntry };
