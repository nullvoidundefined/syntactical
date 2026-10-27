// The one active-Pro rule (spec "2. Pro", Server): a user's granted entitlement rows for either Pro
// product, from any source, whose expires_at is NULL (lifetime and admin grants) or later than
// `now` (an annual period still running). hasPro, the profile's pro status, and the admin toggle
// all derive from these rows, so the Ask limit, /v1/me, and the admin page cannot disagree. `now`
// is a parameter so expiry is testable without waiting. Takes a pooled client too, so a caller in a
// transaction reads its own writes.
import type pg from 'pg';

import type { Database } from '../clients/database.js';
import { PRO_PRODUCT_ID_LIST } from '../constants/proProducts.js';
import type { ProProductId } from '../constants/proProducts.js';

type Queryable = Database | pg.PoolClient;

interface ActiveProRow {
  expiresAt: Date | null;
  productId: ProProductId;
  source: string;
}

async function readActiveProRows(queryable: Queryable, userId: string, now: Date): Promise<ActiveProRow[]> {
  const { rows } = await queryable.query<{ expires_at: Date | null; product_id: ProProductId; source: string }>(
    `SELECT product_id, source, expires_at FROM entitlements
     WHERE user_id = $1 AND product_id = ANY($2::text[]) AND status = 'granted'
       AND (expires_at IS NULL OR expires_at > $3)
     ORDER BY product_id`,
    [userId, [...PRO_PRODUCT_ID_LIST], now],
  );
  return rows.map(({ expires_at: expiresAt, product_id: productId, source }) => ({ expiresAt, productId, source }));
}

export { readActiveProRows };
export type { ActiveProRow };
