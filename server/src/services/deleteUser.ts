// Deletes a user and everything derived from them (B-59.2), on the caller's transaction client.
// Lock order matches sign-in (email advisory lock, then rows) so the two cannot deadlock: the
// email's one-time codes go, the user row is locked, purchase payloads naming the email or id are
// scrubbed in place (rows linked to the user, plus rows whose payload carries the email as a whole
// address or the id), the email's rate-limit counters go, then the user row is deleted (sessions,
// answer events, progress, and goal changes cascade; entitlements and purchase_events user_id go
// null by foreign key). Resolves false when no such user exists. Nothing here logs the email or id.
import type pg from 'pg';

import { carriesPurchaseIdentity } from './carriesPurchaseIdentity.js';
import { deleteRateLimitCountersForEmail } from './deleteRateLimitCountersForEmail.js';
import { normalizeEmail } from './normalizeEmail.js';
import { scrubPurchasePayload } from './scrubPurchasePayload.js';

interface DeleteUserInput {
  rateLimitKeySecret: string;
  userId: string;
}

interface PurchaseEventRow {
  payload: unknown;
  provider: string;
  provider_event_id: string;
  user_id: string | null;
}

// Escapes the LIKE wildcards and the escape character itself, then wraps the value in `%`.
function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

async function scrubPurchaseEvents(
  client: pg.PoolClient,
  identity: { email: string; userId: string },
): Promise<void> {
  const { email, userId } = identity;
  // The SQL is a superset (it also folds NFKC forms); the JS predicate decides which rows change.
  const { rows } = await client.query<PurchaseEventRow>(
    `SELECT provider, provider_event_id, payload, user_id FROM purchase_events
     WHERE user_id = $1
        OR lower(normalize(payload::text, NFKC)) LIKE $2 ESCAPE '\\'
        OR lower(normalize(payload::text, NFKC)) LIKE $3 ESCAPE '\\'
     FOR UPDATE`,
    [userId, containsPattern(email), containsPattern(userId)],
  );
  const changed = rows
    .filter(
      ({ payload, user_id: rowUserId }) =>
        rowUserId === userId || carriesPurchaseIdentity(payload, identity),
    )
    .map(({ payload, provider, provider_event_id: providerEventId }) => ({
      payload: scrubPurchasePayload(payload, identity),
      previous: payload,
      provider,
      providerEventId,
    }))
    .filter(({ payload, previous }) => JSON.stringify(payload) !== JSON.stringify(previous))
    .map(({ payload, provider, providerEventId }) => ({
      payload,
      provider,
      providerEventId,
    }));
  if (changed.length === 0) {
    return;
  }
  await client.query(
    `UPDATE purchase_events AS target SET payload = updated.payload
     FROM jsonb_to_recordset($1::jsonb)
       AS updated(provider text, "providerEventId" text, payload jsonb)
     WHERE target.provider = updated.provider
       AND target.provider_event_id = updated."providerEventId"`,
    [JSON.stringify(changed)],
  );
}

async function deleteUser(client: pg.PoolClient, input: DeleteUserInput): Promise<boolean> {
  const { rateLimitKeySecret, userId } = input;
  const found = await client.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [
    userId,
  ]);
  const [row] = found.rows;
  if (!row) {
    return false;
  }
  const email = normalizeEmail(row.email);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [email]);
  await client.query('DELETE FROM one_time_codes WHERE email = $1', [email]);
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  await scrubPurchaseEvents(client, { email, userId });
  await deleteRateLimitCountersForEmail(client, rateLimitKeySecret, email);
  await client.query('DELETE FROM users WHERE id = $1', [userId]);
  return true;
}

export { deleteUser };
