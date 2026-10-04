// B-37b: whether a user holds a granted entitlement for a product id. One parameterized query;
// a revoked row, another user's row, or no row all answer false.
import type { Database } from '../clients/database.js';

async function hasEntitlement(database: Database, userId: string, productId: string): Promise<boolean> {
  const { rowCount } = await database.query(
    "SELECT 1 FROM entitlements WHERE user_id = $1 AND product_id = $2 AND status = 'granted' LIMIT 1",
    [userId, productId],
  );
  return (rowCount ?? 0) > 0;
}

export { hasEntitlement };
