// PUT /v1/admin/access's write: in one transaction, under the user's row lock, grants or revokes
// the session user's 'admin'-source entitlement on the lifetime Pro product, with expires_at NULL.
// A granted 'revenuecat' row is never changed (the purchase stays in force); a revoked one (a
// refunded purchase) may be re-granted as 'admin'. Revoking touches only an 'admin' row. An annual
// row is never written here. The answer is listAdminAccess read inside the transaction, so a PUT
// reports exactly what a GET would, an active annual purchase included. Undefined when the user is
// gone.
//
// Serialization with the RevenueCat webhook: lockUserRow takes FOR UPDATE on the users row, which
// conflicts with the FOR KEY SHARE that recordPurchaseEvent takes on the same row
// (SELECT id FROM users WHERE id = $1 FOR KEY SHARE) before it writes the entitlement. So a PUT
// waits for an in-flight webhook transaction to commit and then reads its result, and the
// webhook waits for the PUT. The upsert's WHERE is defense in depth for the same rule.
//
// After a refund an admin re-grant (source 'admin') is removed by any later RevenueCat revoke
// event for the same product, because recomputeEntitlement rewrites source and status. This
// fails closed and is intended.
import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';
import { PRO_PRODUCT_IDS } from '../constants/proProducts.js';
import type { AdminProductEntry } from '../types/AdminProductEntry.js';

import { listAdminAccess } from './listAdminAccess.js';
import { lockUserRow } from './lockUserRow.js';

const PRODUCT_ID = PRO_PRODUCT_IDS.LIFETIME;

async function setAdminAccess(
  database: Database,
  userId: string,
  isGranted: boolean,
  now: Date,
): Promise<AdminProductEntry | undefined> {
  return withTransaction(
    database,
    async (client) => {
      if (!(await lockUserRow(client, userId))) {
        return undefined;
      }
      const { rows } = await client.query<{ source: string; status: string }>(
        'SELECT source, status FROM entitlements WHERE user_id = $1 AND product_id = $2',
        [userId, PRODUCT_ID],
      );
      const [row] = rows;
      const isPurchaseInForce = row?.status === 'granted' && row.source !== 'admin';
      if (isGranted && !isPurchaseInForce) {
        await client.query(
          `INSERT INTO entitlements (user_id, product_id, source, status, expires_at)
           VALUES ($1, $2, 'admin', 'granted', NULL)
           ON CONFLICT (user_id, product_id) DO UPDATE SET source = 'admin', status = 'granted', expires_at = NULL
           WHERE entitlements.source = 'admin' OR entitlements.status = 'revoked'`,
          [userId, PRODUCT_ID],
        );
      }
      if (!isGranted && row?.source === 'admin' && row.status === 'granted') {
        await client.query(
          "UPDATE entitlements SET status = 'revoked' WHERE user_id = $1 AND product_id = $2 AND source = 'admin'",
          [userId, PRODUCT_ID],
        );
      }
      return listAdminAccess(client, userId, now);
    },
    { hasTimeouts: true },
  );
}

export { setAdminAccess };
