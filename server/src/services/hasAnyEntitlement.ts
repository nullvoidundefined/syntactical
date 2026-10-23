// Whether a user holds any granted entitlement, from a purchase or an admin grant: the gate for
// POST /v1/ask. A revoked row (cancelled or refunded) does not count.
import type { Database } from '../clients/database.js';

async function hasAnyEntitlement(database: Database, userId: string): Promise<boolean> {
  const { rowCount } = await database.query(
    "SELECT 1 FROM entitlements WHERE user_id = $1 AND status = 'granted' LIMIT 1",
    [userId],
  );
  return (rowCount ?? 0) > 0;
}

export { hasAnyEntitlement };
