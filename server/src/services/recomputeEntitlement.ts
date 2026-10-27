// Sets the (user, Pro product) entitlement from the purchase events of the stores that can change
// it. Status: the latest grant or revoke event by occurred_at wins, a revoke winning a tie. What
// revokes comes from the product's rule (PRO_PRODUCT_RULES): a REVOKE_TYPES event always; a
// CANCELLATION when the product's cancellation is 'revoke' (the lifetime product); and, on either
// product, a CANCELLATION whose cancel_reason is PRO_REFUND_CANCEL_REASON (a store refund). Every
// other expiry-only event never changes the status or creates a row. Expiry: while granted,
// expires_at is the expiration_at_ms of the latest grant or expiry-only event that does not revoke;
// a revoke leaves expires_at as it was, so a RENEWAL stamped before a recorded EXPIRATION cannot
// move it. A product without a period (requiresExpiry false, the lifetime) takes expiry-only events
// for nothing and its events carry no expiration_at_ms, so its row keeps expires_at NULL. A product
// with a period (requiresExpiry true, the annual) fails closed: an event without expiration_at_ms
// is ignored for status (a grant) and for expiry (any event), so its granted row never has a NULL
// expires_at, which would mean Pro forever; recordPurchaseEvent still records such a grant and warns
// about it. The (user_id, product_id) key keeps the annual and lifetime rows independent. The row
// is written with source 'revenuecat' only when something differs, so a redelivery leaves
// updated_at untouched. Callers hold the (user, product) advisory lock so the reads see every
// committed event.
import type pg from 'pg';

import { PRO_PRODUCT_RULES, PRO_REFUND_CANCEL_REASON } from '../constants/proProducts.js';
import type { ProProductId } from '../constants/proProducts.js';
import { REVENUECAT_EVENTS } from '../constants/revenueCatEvents.js';

const {
  CANCELLATION_TYPE,
  ENTITLEMENT_SOURCE,
  EXPIRY_ONLY_TYPES,
  GRANT_TYPES,
  PROVIDER,
  REVOKE_TYPES,
  SANDBOX_ENVIRONMENT,
  STORES,
} = REVENUECAT_EVENTS;

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

// The latest grant or revoke wins. When requiresExpiry, a grant without expiration_at_ms is skipped;
// a revoke never needs one.
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
     WHERE is_revoke
        OR (kind = ANY($11::text[]) AND NOT ($12::boolean AND payload->>'expiration_at_ms' IS NULL))
     ORDER BY occurred_at DESC, is_revoke DESC
     LIMIT 1`,
    [...eventParams(userId, productId, acceptSandbox), [...GRANT_TYPES], PRO_PRODUCT_RULES[productId].requiresExpiry],
  );
  return rows[0]?.status;
}

// The latest non-revoking grant or expiry-only event's expiration_at_ms, or null when it carries
// none (the lifetime product). When requiresExpiry, events without one are skipped, and the grant
// that made the row granted carries one, so the answer is never null. Only read while granted: the
// latest grant is then later than every revoke, so this event is too.
async function readExpiryMs(
  client: pg.PoolClient,
  userId: string,
  productId: ProProductId,
  acceptSandbox: boolean,
): Promise<number | null> {
  const { requiresExpiry } = PRO_PRODUCT_RULES[productId];
  const expiryKinds = requiresExpiry ? [...GRANT_TYPES, ...EXPIRY_ONLY_TYPES] : [...GRANT_TYPES];
  const { rows } = await client.query<{ expiration_at_ms: number | null }>(
    `WITH events AS (${EVENTS_SQL})
     SELECT (payload->>'expiration_at_ms')::double precision AS expiration_at_ms
     FROM events
     WHERE NOT is_revoke AND kind = ANY($11::text[])
       AND NOT ($12::boolean AND payload->>'expiration_at_ms' IS NULL)
     ORDER BY occurred_at DESC, (payload->>'expiration_at_ms')::double precision DESC NULLS LAST
     LIMIT 1`,
    [...eventParams(userId, productId, acceptSandbox), expiryKinds, requiresExpiry],
  );
  return rows[0]?.expiration_at_ms ?? null;
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
  const expiryMs = status === 'granted' ? await readExpiryMs(client, userId, productId, acceptSandbox) : null;
  await client.query(
    `INSERT INTO entitlements (user_id, product_id, source, status, expires_at)
     VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000))
     ON CONFLICT (user_id, product_id) DO UPDATE SET
       source = EXCLUDED.source,
       status = EXCLUDED.status,
       expires_at = CASE WHEN EXCLUDED.status = 'granted' THEN EXCLUDED.expires_at ELSE entitlements.expires_at END
     WHERE entitlements.status IS DISTINCT FROM EXCLUDED.status
        OR entitlements.source IS DISTINCT FROM EXCLUDED.source
        OR (EXCLUDED.status = 'granted' AND entitlements.expires_at IS DISTINCT FROM EXCLUDED.expires_at)`,
    [userId, productId, ENTITLEMENT_SOURCE, status, expiryMs],
  );
}

export { recomputeEntitlement };
