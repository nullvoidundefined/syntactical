// Deletes a user and everything derived from them (B-59.2), on the caller's transaction client.
// The transaction first bounds its waits (B-59.5): a lock_timeout and a statement_timeout, so a held
// lock surfaces as an error (a 500 after rollback) instead of a hang.
// Lock order matches sign-in (email advisory lock, then rows) so the two cannot deadlock: the
// email's one-time codes go, the user row is locked, purchase payloads naming the email or id are
// scrubbed in place (rows linked to the user, plus rows whose payload carries the email as a whole
// address or the id; a row linked to another user is scrubbed match-only; candidates are read
// without a row lock, and only the chosen rows are locked, in key order, and re-read), the email's
// rate-limit counters go, then the user row is deleted (sessions, answer events, progress, and goal
// changes cascade; entitlements and purchase_events user_id go null by foreign key). Resolves false, having
// changed nothing, when no such user exists, including when a concurrent deletion of the same user won the
// email's advisory lock first (B-59.6: the user row is re-checked after the lock, before the codes go, and the
// row lock's result is checked too). Nothing here logs the email or id.
import type pg from 'pg';

import { AUTH } from '../constants/auth.js';

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

async function scrubPurchaseEvents(client: pg.PoolClient, identity: { email: string; userId: string }): Promise<void> {
  const { email, userId } = identity;
  // The SQL is a superset (it also folds NFKC forms and takes every payload holding a `%`, which may carry the
  // email or id percent-encoded); it takes no row lock. The JS predicate chooses the rows, and only those are locked.
  const { rows: candidates } = await client.query<PurchaseEventRow>(
    `SELECT provider, provider_event_id, payload, user_id FROM purchase_events
     WHERE user_id = $1
        OR lower(normalize(payload::text, NFKC)) LIKE $2 ESCAPE '\\'
        OR lower(normalize(payload::text, NFKC)) LIKE $3 ESCAPE '\\'
        OR payload::text LIKE '%\\%%' ESCAPE '\\'`,
    [userId, containsPattern(email), containsPattern(userId)],
  );
  const chosen = candidates.filter(
    ({ payload, user_id: rowUserId }) => rowUserId === userId || carriesPurchaseIdentity(payload, identity),
  );
  if (chosen.length === 0) {
    return;
  }
  // The locked read is authoritative: a row that changed since the candidate read is judged from this version.
  const { rows } = await client.query<PurchaseEventRow>(
    `SELECT target.provider, target.provider_event_id, target.payload, target.user_id
     FROM purchase_events AS target
     JOIN unnest($1::text[], $2::text[]) AS chosen(provider, provider_event_id)
       ON target.provider = chosen.provider AND target.provider_event_id = chosen.provider_event_id
     ORDER BY target.provider, target.provider_event_id
     FOR UPDATE OF target`,
    [chosen.map(({ provider }) => provider), chosen.map(({ provider_event_id: providerEventId }) => providerEventId)],
  );
  const changed = rows
    .filter(({ payload, user_id: rowUserId }) => rowUserId === userId || carriesPurchaseIdentity(payload, identity))
    .map(({ payload, provider, provider_event_id: providerEventId, user_id: rowUserId }) => ({
      payload: scrubPurchasePayload(payload, identity, {
        clearPiiAttributes: rowUserId === null || rowUserId === userId,
      }),
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
  // SET LOCAL takes no bind parameters; both values are constants from AUTH.DELETION.
  await client.query(`SET LOCAL lock_timeout = '${AUTH.DELETION.LOCK_TIMEOUT}'`);
  await client.query(`SET LOCAL statement_timeout = '${AUTH.DELETION.STATEMENT_TIMEOUT}'`);
  const found = await client.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  const [row] = found.rows;
  if (!row) {
    return false;
  }
  const email = normalizeEmail(row.email);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [email]);
  // A concurrent deletion of the same user committed before it released this lock: re-read without a row lock
  // (the users FOR UPDATE must stay after the codes delete, or it deadlocks with sign-in verify).
  const stillThere = await client.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (stillThere.rows.length === 0) {
    return false;
  }
  await client.query('DELETE FROM one_time_codes WHERE email = $1', [email]);
  const locked = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  if (locked.rows.length === 0) {
    return false;
  }
  await scrubPurchaseEvents(client, { email, userId });
  await deleteRateLimitCountersForEmail(client, rateLimitKeySecret, email);
  await client.query('DELETE FROM users WHERE id = $1', [userId]);
  return true;
}

export { deleteUser };
