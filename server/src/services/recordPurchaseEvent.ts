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
import type { Logger } from 'pino';

import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';
import { isProProductId, normalizeProductId, PRO_PRODUCT_RULES } from '../constants/proProducts.js';
import type { ProProductId } from '../constants/proProducts.js';
import { REVENUECAT_EVENTS } from '../constants/revenueCatEvents.js';

import { recomputeEntitlement } from './recomputeEntitlement.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCK_NAMESPACE = 'revenuecat-entitlement';

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

function buildPayload(event: RevenueCatEvent): Record<string, string | number | boolean> {
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
      let userId: string | null = null;
      if (UUID_PATTERN.test(appUserId)) {
        const { rows } = await client.query<{ id: string }>('SELECT id FROM users WHERE id = $1 FOR KEY SHARE', [
          appUserId,
        ]);
        userId = rows[0]?.id ?? null;
      }
      if (userId) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `${LOCK_NAMESPACE}:${userId}:${productId}`,
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
      if (userId && canChangeEntitlement) {
        await recomputeEntitlement(client, userId, productId, acceptSandbox);
      }
      return 'recorded';
    },
    { hasTimeouts: true },
  );
}

export { recordPurchaseEvent };
