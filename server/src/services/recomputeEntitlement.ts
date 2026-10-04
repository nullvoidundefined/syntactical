// Sets the (user, product) entitlement from the latest grant or revoke event by occurred_at
// among the stores that can change it; a revoke wins a tie. The row is written with source
// 'revenuecat' only when the status differs, so a redelivery leaves updated_at untouched.
// Callers hold the (user, product) advisory lock so the read sees every committed event.
import type pg from 'pg';

import { REVENUECAT_EVENTS } from '../constants/revenueCatEvents.js';

const { ENTITLEMENT_SOURCE, GRANT_TYPES, PROVIDER, REVOKE_TYPES, STORES } = REVENUECAT_EVENTS;

async function recomputeEntitlement(client: pg.PoolClient, userId: string, productId: string): Promise<void> {
  const { rows } = await client.query<{ status: string }>(
    `SELECT CASE WHEN kind = ANY($3::text[]) THEN 'revoked' ELSE 'granted' END AS status
     FROM purchase_events
     WHERE provider = $4 AND user_id = $1 AND product_id = $2
       AND kind = ANY($5::text[])
       AND payload->>'store' = ANY($6::text[])
     ORDER BY occurred_at DESC, (kind = ANY($3::text[])) DESC
     LIMIT 1`,
    [userId, productId, [...REVOKE_TYPES], PROVIDER, [...GRANT_TYPES, ...REVOKE_TYPES], [...STORES]],
  );
  const [latest] = rows;
  if (!latest) {
    return;
  }
  await client.query(
    `INSERT INTO entitlements (user_id, product_id, source, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, product_id) DO UPDATE SET source = EXCLUDED.source, status = EXCLUDED.status
     WHERE entitlements.status IS DISTINCT FROM EXCLUDED.status
        OR entitlements.source IS DISTINCT FROM EXCLUDED.source`,
    [userId, productId, ENTITLEMENT_SOURCE, latest.status],
  );
}

export { recomputeEntitlement };
