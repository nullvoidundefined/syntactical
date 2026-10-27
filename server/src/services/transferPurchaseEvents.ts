// Records one RevenueCat TRANSFER and moves Pro with it. RevenueCat sends a TRANSFER when a restore
// on another app user id (a second account, or the same person signed up again) takes purchases
// over. In one transaction with the statement and lock timeouts: the new user is the first
// transferred_to id that names a user; the old users are the transferred_from ids that name users.
// Their rows are read FOR KEY SHARE and every (user, Pro product) advisory lock recordPurchaseEvent
// uses is taken in one sorted order, so no other event for these users interleaves. The claim
// insert (kind TRANSFER, product_id NULL, user_id the new user) keeps a redelivery idempotent.
// Then every RevenueCat purchase event of the old users is reassigned to the new user, and both Pro
// products are recomputed for all of them: the new user gains what the old users had, and an old
// user whose events all moved loses it. A SANDBOX transfer moves nothing unless acceptSandbox. A
// deleted user's events have user_id NULL and cannot be moved. The stored payload is the scalar
// allowlist, so neither list of ids is stored, and no id is logged.
import type pg from 'pg';
import type { Logger } from 'pino';

import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';
import { PRO_PRODUCT_ID_LIST } from '../constants/proProducts.js';
import { REVENUECAT_EVENTS } from '../constants/revenueCatEvents.js';

import { recomputeEntitlement } from './recomputeEntitlement.js';
import { buildPayload, entitlementLockKey, UUID_PATTERN } from './recordPurchaseEvent.js';

interface TransferEvent {
  [key: string]: unknown;
  event_timestamp_ms: number;
  id: string;
  transferred_from: string[];
  transferred_to: string[];
  type: string;
}

interface TransferPurchaseEventsOptions {
  acceptSandbox: boolean;
  database: Database;
  event: TransferEvent;
  logger: Logger;
}

type TransferResult = 'duplicate' | 'recorded';

// The ids among `ids` that name an existing user, lowercased; each user row read FOR KEY SHARE.
async function lockExistingUsers(client: pg.PoolClient, ids: readonly string[]): Promise<Set<string>> {
  const candidates = [...new Set(ids.filter((id) => UUID_PATTERN.test(id)).map((id) => id.toLowerCase()))];
  if (candidates.length === 0) {
    return new Set();
  }
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR KEY SHARE',
    [candidates],
  );
  return new Set(rows.map(({ id }) => id));
}

async function transferPurchaseEvents(options: TransferPurchaseEventsOptions): Promise<TransferResult> {
  const { acceptSandbox, database, event, logger } = options;
  const { event_timestamp_ms: eventTimestampMs, id, transferred_from: fromIds, transferred_to: toIds, type } = event;

  return withTransaction<TransferResult>(
    database,
    async (client) => {
      const knownToIds = await lockExistingUsers(client, toIds);
      const newUserId = toIds.map((toId) => toId.toLowerCase()).find((toId) => knownToIds.has(toId)) ?? null;
      const oldUserIds = [...(await lockExistingUsers(client, fromIds))].filter((fromId) => fromId !== newUserId);
      const affectedUserIds = newUserId ? [newUserId, ...oldUserIds].sort() : [];
      for (const userId of affectedUserIds) {
        for (const productId of PRO_PRODUCT_ID_LIST) {
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
            entitlementLockKey(userId, productId),
          ]);
        }
      }
      const { rowCount } = await client.query(
        `INSERT INTO purchase_events (provider, provider_event_id, kind, product_id, user_id, occurred_at, payload)
         VALUES ($1, $2, $3, NULL, $4, to_timestamp($5::double precision / 1000), $6::jsonb)
         ON CONFLICT (provider, provider_event_id) DO NOTHING`,
        [REVENUECAT_EVENTS.PROVIDER, id, type, newUserId, eventTimestampMs, JSON.stringify(buildPayload(event))],
      );
      if (rowCount === 0) {
        return 'duplicate';
      }
      if (event.environment === REVENUECAT_EVENTS.SANDBOX_ENVIRONMENT && !acceptSandbox) {
        logger.warn({ eventType: type, reason: 'sandbox' }, 'revenuecat sandbox event not applied');
        return 'recorded';
      }
      if (!newUserId || oldUserIds.length === 0) {
        return 'recorded';
      }
      await client.query('UPDATE purchase_events SET user_id = $1 WHERE provider = $2 AND user_id = ANY($3::uuid[])', [
        newUserId,
        REVENUECAT_EVENTS.PROVIDER,
        oldUserIds,
      ]);
      for (const userId of affectedUserIds) {
        for (const productId of PRO_PRODUCT_ID_LIST) {
          await recomputeEntitlement(client, userId, productId, acceptSandbox);
        }
      }
      return 'recorded';
    },
    { hasTimeouts: true },
  );
}

export { transferPurchaseEvents };
export type { TransferEvent };
