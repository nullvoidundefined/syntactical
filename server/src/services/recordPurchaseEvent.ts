// Records one RevenueCat event inside one transaction and recomputes the entitlement it can
// change. The user is resolved only for a UUID app_user_id naming an existing user (row read
// FOR KEY SHARE); a pair advisory lock then serializes events for one (user, product) so the
// recompute sees committed rows. The primary-key insert is the claim: zero rows inserted means
// 'duplicate'. The transaction has the statement and lock timeouts (withTransaction hasTimeouts),
// so a held user row lock surfaces as a retryable 503 and stores nothing. Rows are never updated. Any thrown error rolls back and propagates, so
// RevenueCat redelivers. The stored payload is an allowlist of scalar fields, never the body.
// Only the two Pro products (constants/proProducts.ts) change an entitlement; any other product is recorded and warned about.
// product_id is normalised first (a Play id's base-plan suffix stripped); the normalised id is matched, locked on, and stored, and the payload keeps the raw value.
// A grant without expiration_at_ms on a product that requires one (the annual, PRO_PRODUCT_RULES) is recorded but ignored by recomputeEntitlement (fail closed), and warned about once.
// A SANDBOX event is recorded but recomputes nothing unless acceptSandbox (REVENUECAT_ACCEPT_SANDBOX), and is warned about once.
// A Pro product event for a user a TRANSFER moved purchases away from, stamped at or before that
// transfer (a retry, or a delivery that waited on the locks), is recorded under the user the
// purchase went to (readTransferDestination), and both users are recomputed; one stamped later is
// a purchase made since and stays. Lock order, shared with transferPurchaseEvents: the transfer
// lock (shared here, exclusive there, so no transfer runs while the destination is read), then user
// rows FOR KEY SHARE, then the (user, product) advisory locks in sorted user order.
import type pg from 'pg';
import type { Logger } from 'pino';

import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';
import { isProProductId, normalizeProductId, PRO_PRODUCT_RULES } from '../constants/proProducts.js';
import type { ProProductId } from '../constants/proProducts.js';
import { REVENUECAT_EVENTS } from '../constants/revenueCatEvents.js';

import { recomputeEntitlement } from './recomputeEntitlement.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCK_NAMESPACE = 'revenuecat-entitlement';
// Taken first: shared by every event for a user, exclusive by a TRANSFER.
const TRANSFER_LOCK_KEY = 'revenuecat-transfer';

// The advisory lock key that serializes events for one (user, product). transferPurchaseEvents
// takes the same keys.
function entitlementLockKey(userId: string, productId: string): string {
  return `${LOCK_NAMESPACE}:${userId}:${productId}`;
}

interface RevenueCatEvent {
  [key: string]: unknown;
  app_user_id: string;
  event_timestamp_ms: number;
  id: string;
  product_id: string;
  store: string;
  type: string;
}

interface RecordPurchaseEventOptions {
  acceptSandbox: boolean;
  database: Database;
  event: RevenueCatEvent;
  logger: Logger;
}

type RecordResult = 'duplicate' | 'recorded';

// A grant with no period end on a product that requires one. Granting it would mean Pro forever,
// so recomputeEntitlement ignores it; it is still recorded (the claim keeps redeliveries
// idempotent) and answered 200, so RevenueCat does not retry it.
function isGrantWithoutRequiredExpiry(productId: ProProductId, event: RevenueCatEvent): boolean {
  return (
    PRO_PRODUCT_RULES[productId].requiresExpiry &&
    (REVENUECAT_EVENTS.GRANT_TYPES as readonly string[]).includes(event.type) &&
    typeof event.expiration_at_ms !== 'number'
  );
}

// The user that holds, now, a purchase event for `userId` stamped `eventTimestampMs`: undefined
// when no TRANSFER moved it (it stays with userId), null when the user it went to was deleted.
// Each hop takes the first transfer away from the current user at or after the time the event
// reached that user (its stamp, then each transfer's), which is where it would sit had it arrived
// on time. A transfer is used at most once, so a chain that returns to a user ends.
async function readTransferDestination(
  client: pg.PoolClient,
  userId: string,
  eventTimestampMs: number,
): Promise<string | null | undefined> {
  let destination: string | null | undefined;
  let fromUserId = userId;
  let arrivedAtMs = eventTimestampMs;
  const usedIds: string[] = [];
  for (;;) {
    const { rows } = await client.query<{ id: string; occurred_at_ms: number; to_user_id: string | null }>(
      `SELECT id, to_user_id, (extract(epoch FROM occurred_at) * 1000)::double precision AS occurred_at_ms
       FROM purchase_transfers
       WHERE provider = $1 AND from_user_id = $2 AND occurred_at >= to_timestamp($3::double precision / 1000)
         AND NOT (id = ANY($4::bigint[]))
       ORDER BY occurred_at, id
       LIMIT 1`,
      [REVENUECAT_EVENTS.PROVIDER, fromUserId, arrivedAtMs, usedIds],
    );
    const [hop] = rows;
    if (!hop) {
      return destination;
    }
    destination = hop.to_user_id;
    if (destination === null) {
      return null;
    }
    usedIds.push(hop.id);
    fromUserId = destination;
    arrivedAtMs = hop.occurred_at_ms;
  }
}

// The id when `userId` names an existing user, its row read FOR KEY SHARE; otherwise null.
async function lockUserRow(client: pg.PoolClient, userId: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM users WHERE id = $1 FOR KEY SHARE', [userId]);
  return rows[0]?.id ?? null;
}

function buildPayload(event: Readonly<Record<string, unknown>>): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {};
  for (const key of REVENUECAT_EVENTS.PAYLOAD_KEYS) {
    const value = event[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      payload[key] = value;
    }
  }
  return payload;
}

async function recordPurchaseEvent(options: RecordPurchaseEventOptions): Promise<RecordResult> {
  const { acceptSandbox, database, event, logger } = options;
  const {
    app_user_id: appUserId,
    event_timestamp_ms: eventTimestampMs,
    id,
    product_id: rawProductId,
    store,
    type,
  } = event;
  const productId = normalizeProductId(rawProductId);
  const canChangeEntitlement = (REVENUECAT_EVENTS.STORES as readonly string[]).includes(store);

  return withTransaction<RecordResult>(
    database,
    async (client) => {
      // appUserId's user, and the user the event is recorded under (another after a TRANSFER).
      let ownerId: string | null = null;
      let userId: string | null = null;
      if (UUID_PATTERN.test(appUserId)) {
        await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))', [TRANSFER_LOCK_KEY]);
        ownerId = await lockUserRow(client, appUserId);
        userId = ownerId;
      }
      if (ownerId && isProProductId(productId)) {
        const destination = await readTransferDestination(client, ownerId, eventTimestampMs);
        if (destination !== undefined) {
          userId = destination === null ? null : await lockUserRow(client, destination);
        }
      }
      const lockedUserIds = [...new Set([ownerId, userId].filter((id): id is string => id !== null))].sort();
      for (const lockedUserId of lockedUserIds) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          entitlementLockKey(lockedUserId, productId),
        ]);
      }
      const { rowCount } = await client.query(
        `INSERT INTO purchase_events (provider, provider_event_id, kind, product_id, user_id, occurred_at, payload)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6::double precision / 1000), $7::jsonb)
         ON CONFLICT (provider, provider_event_id) DO NOTHING`,
        [
          REVENUECAT_EVENTS.PROVIDER,
          id,
          type,
          productId,
          userId,
          eventTimestampMs,
          JSON.stringify(buildPayload(event)),
        ],
      );
      if (rowCount === 0) {
        return 'duplicate';
      }
      if (!isProProductId(productId)) {
        logger.warn({ eventType: type, reason: 'unmapped_product' }, 'revenuecat event for an unmapped product');
        return 'recorded';
      }
      if (isGrantWithoutRequiredExpiry(productId, event)) {
        logger.warn({ productId, type }, 'annual grant without expiration ignored');
      }
      if (event.environment === REVENUECAT_EVENTS.SANDBOX_ENVIRONMENT && !acceptSandbox) {
        logger.warn({ eventType: type, reason: 'sandbox' }, 'revenuecat sandbox event not applied');
        return 'recorded';
      }
      if (canChangeEntitlement) {
        for (const lockedUserId of lockedUserIds) {
          await recomputeEntitlement(client, lockedUserId, productId, acceptSandbox);
        }
      }
      return 'recorded';
    },
    { hasTimeouts: true },
  );
}

export { buildPayload, entitlementLockKey, recordPurchaseEvent, TRANSFER_LOCK_KEY, UUID_PATTERN };
