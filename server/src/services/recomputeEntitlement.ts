// Sets the (user, Pro product) entitlement from the purchase events of the stores that can change
// it: the latest grant or revoke event by occurred_at wins, a revoke winning a tie. What revokes
// comes from the product's rule (PRO_PRODUCT_RULES): a REVOKE_TYPES event always; a CANCELLATION
// when the product's cancellation is 'revoke' (the lifetime product); and, on either product, a
// CANCELLATION whose cancel_reason is PRO_REFUND_CANCEL_REASON, which is how RevenueCat reports a
// store refund. Every other expiry-only event (an annual CANCELLATION with auto-renew turned off,
// a SUBSCRIPTION_EXTENDED) never changes the status and never creates a row. The row is written
// with source 'revenuecat' only when the status differs, so a redelivery leaves updated_at
// untouched. Callers hold the (user, product) advisory lock so the read sees every committed event.
import type pg from 'pg';

import { PRO_PRODUCT_RULES, PRO_REFUND_CANCEL_REASON } from '../constants/proProducts.js';
import type { ProProductId } from '../constants/proProducts.js';
import { REVENUECAT_EVENTS } from '../constants/revenueCatEvents.js';

const { CANCELLATION_TYPE, ENTITLEMENT_SOURCE, GRANT_TYPES, PROVIDER, REVOKE_TYPES, SANDBOX_ENVIRONMENT, STORES } =
  REVENUECAT_EVENTS;

type Status = 'granted' | 'revoked';

// One product's events from the stores that can change it, each marked with whether it revokes;
// SANDBOX events only when the server accepts them (Task 3.4). $1 user, $2 product, $3 provider,
// $4 stores, $5 revoke types, $6 CANCELLATION, $7 whether a CANCELLATION revokes on this product,
// $8 the refund cancel_reason, $9 acceptSandbox, $10 SANDBOX. A constant, never user input.
const EVENTS_SQL = `SELECT kind, occurred_at, payload,
    (kind = ANY($5::text[])
      OR (kind = $6 AND ($7::boolean OR payload->>'cancel_reason' IS NOT DISTINCT FROM $8::text))) AS is_revoke
  FROM purchase_events
  WHERE provider = $3 AND user_id = $1 AND product_id = $2 AND payload->>'store' = ANY($4::text[])
    AND ($9::boolean OR payload->>'environment' IS DISTINCT FROM $10::text)`;

function eventParams(userId: string, productId: ProProductId, acceptSandbox: boolean): unknown[] {
  return [
    userId,
    productId,
    PROVIDER,
    [...STORES],
    [...REVOKE_TYPES],
    CANCELLATION_TYPE,
    PRO_PRODUCT_RULES[productId].cancellation === 'revoke',
    PRO_REFUND_CANCEL_REASON,
    acceptSandbox,
    SANDBOX_ENVIRONMENT,
  ];
}

async function readStatus(
  client: pg.PoolClient,
  userId: string,
  productId: ProProductId,
  acceptSandbox: boolean,
): Promise<Status | undefined> {
  const { rows } = await client.query<{ status: Status }>(
    `WITH events AS (${EVENTS_SQL})
     SELECT CASE WHEN is_revoke THEN 'revoked' ELSE 'granted' END AS status
     FROM events
     WHERE is_revoke OR kind = ANY($11::text[])
     ORDER BY occurred_at DESC, is_revoke DESC
     LIMIT 1`,
    [...eventParams(userId, productId, acceptSandbox), [...GRANT_TYPES]],
  );
  return rows[0]?.status;
}

async function recomputeEntitlement(
  client: pg.PoolClient,
  userId: string,
  productId: ProProductId,
  acceptSandbox: boolean,
): Promise<void> {
  const status = await readStatus(client, userId, productId, acceptSandbox);
  if (!status) {
    return;
  }
  await client.query(
    `INSERT INTO entitlements (user_id, product_id, source, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, product_id) DO UPDATE SET source = EXCLUDED.source, status = EXCLUDED.status
     WHERE entitlements.status IS DISTINCT FROM EXCLUDED.status
        OR entitlements.source IS DISTINCT FROM EXCLUDED.source`,
    [userId, productId, ENTITLEMENT_SOURCE, status],
  );
}

export { recomputeEntitlement };
