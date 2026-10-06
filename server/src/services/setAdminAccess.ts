// PUT /v1/admin/access's write: in one transaction, under the user's row lock, grants or revokes
// the session user's 'admin'-source entitlement for a product. A granted 'revenuecat' row is never
// changed (the purchase stays in force); a revoked one (a refunded purchase) may be re-granted
// as 'admin'. Revoking touches only an 'admin' row. Undefined when the user is gone.
import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';
import type { AdminProductEntry } from '../types/AdminProductEntry.js';

import { lockUserRow } from './lockUserRow.js';
import { toAdminProductEntry } from './toAdminProductEntry.js';

async function setAdminAccess(
  database: Database,
  userId: string,
  productId: string,
  isGranted: boolean,
): Promise<AdminProductEntry | undefined> {
  return withTransaction(
    database,
    async (client) => {
      if (!(await lockUserRow(client, userId))) {
        return undefined;
      }
      const { rows } = await client.query<{ source: string; status: string }>(
        'SELECT source, status FROM entitlements WHERE user_id = $1 AND product_id = $2',
        [userId, productId],
      );
      const [row] = rows;
      if (row?.status === 'granted' && row.source !== 'admin') {
        return toAdminProductEntry(productId, row.source);
      }
      if (isGranted) {
        await client.query(
          `INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, $2, 'admin', 'granted')
           ON CONFLICT (user_id, product_id) DO UPDATE SET source = 'admin', status = 'granted'`,
          [userId, productId],
        );
        return toAdminProductEntry(productId, 'admin');
      }
      if (row?.source === 'admin' && row.status === 'granted') {
        await client.query(
          "UPDATE entitlements SET status = 'revoked' WHERE user_id = $1 AND product_id = $2 AND source = 'admin'",
          [userId, productId],
        );
      }
      return toAdminProductEntry(productId, undefined);
    },
    { hasTimeouts: true },
  );
}

export { setAdminAccess };
