// The admin's access to each paid product: every paid product once, granted or not, with the
// source of a granted entitlement ('revenuecat' reads as 'purchase').
import type { Database } from '../clients/database.js';
import type { AdminProductEntry } from '../types/AdminProductEntry.js';

import { toAdminProductEntry } from './toAdminProductEntry.js';

async function listAdminAccess(
  database: Database,
  userId: string,
  paidProductIds: ReadonlySet<string>,
): Promise<AdminProductEntry[]> {
  const { rows } = await database.query<{ product_id: string; source: string; status: string }>(
    'SELECT product_id, source, status FROM entitlements WHERE user_id = $1 AND product_id = ANY($2::text[])',
    [userId, [...paidProductIds]],
  );
  return [...paidProductIds].sort().map((productId) => {
    const row = rows.find((candidate) => candidate.product_id === productId);
    return toAdminProductEntry(productId, row?.status === 'granted' ? row.source : undefined);
  });
}

export { listAdminAccess };
