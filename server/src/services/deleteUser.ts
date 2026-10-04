// Deletes a user and everything derived from them (B-59.2), on the caller's transaction client.
// The transaction first bounds its waits (B-59.5): a lock_timeout and a statement_timeout, so a held
// lock surfaces as an error (a 500 after rollback) instead of a hang.
// Lock order matches sign-in (email advisory lock, then rows) so the two cannot deadlock: the
// email's one-time codes go, the user row is locked, purchase payloads naming the email or id are
// scrubbed in place (rows linked to the user, plus rows whose payload carries the email as a whole
// address or the id; a row linked to another user is scrubbed match-only; candidates are read
// without a row lock, and only the chosen rows are locked, in key order, and re-read), the email's
// rate-limit counters and the user's own account-delete counters go (B-59.12), then the user row is deleted (sessions, answer events, progress, and goal
// changes cascade; entitlements and purchase_events user_id go null by foreign key). Resolves false, having
// changed nothing, when no such user exists, including when a concurrent deletion of the same user won the
// email's advisory lock first (B-59.6: the user row is re-checked after the lock, before the codes go). The row
// lock's result is checked too and also resolves false, but by then the email's codes are already deleted;
// only a user row removed outside the advisory lock reaches that branch. The scrub is bounded (B-59.13): before any
// payload is loaded, the candidate set is measured in SQL, and over the row or byte cap it throws
// DeletionTooLargeError (the transaction rolls back). Nothing here logs the email or id.
import type pg from 'pg';

import { AUTH } from '../constants/auth.js';

import { carriesPurchaseIdentity } from './carriesPurchaseIdentity.js';
import { deleteRateLimitCountersForEmail } from './deleteRateLimitCountersForEmail.js';
import { deleteRateLimitCountersForUser } from './deleteRateLimitCountersForUser.js';
import { DeletionTooLargeError } from './deletionTooLargeError.js';
import { exceedsDepthCap } from './exceedsDepthCap.js';
import { normalizeEmail } from './normalizeEmail.js';
import type { PurchaseIdentity } from './purchaseIdentity.js';
import { scrubPurchasePayload } from './scrubPurchasePayload.js';

interface DeleteUserInput {
  rateLimitKeySecret: string;
  // The scrub's caps on candidate payload text and rows; default to AUTH.DELETION.SCRUB_MAX_BYTES and SCRUB_MAX_ROWS.
  scrubMaxBytes?: number;
  scrubMaxRows?: number;
  // The transaction's statement_timeout in milliseconds; defaults to AUTH.DELETION.STATEMENT_TIMEOUT_MS.
  statementTimeoutMs?: number;
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

// Own rows are always chosen; unlinked rows by the loose match (B-59.7) or when nested past the depth cap, which
// match-only reads cannot see into (B-59.8, fail closed); another user's rows by the strict one.
function isChosenRow(rowUserId: string | null, payload: unknown, userId: string, identity: PurchaseIdentity): boolean {
  return (
    rowUserId === userId ||
    (rowUserId === null && exceedsDepthCap(payload)) ||
    carriesPurchaseIdentity(payload, identity, { isLoose: rowUserId === null })
  );
}

interface ScrubCaps {
  maxBytes: number;
  maxRows: number;
}

// The candidate prefilter, shared by the measure and the read ($1 user id, $2 email pattern, $3 id pattern).
const CANDIDATE_FILTER = `user_id = $1
        OR lower(normalize(payload::text, NFKC)) LIKE $2 ESCAPE '\\'
        OR lower(normalize(payload::text, NFKC)) LIKE $3 ESCAPE '\\'
        OR normalize(payload::text, NFKC) LIKE '%\\%%' ESCAPE '\\'`;

// Throws DeletionTooLargeError when the candidate set is over the row or byte cap. Measured in SQL and bounded by
// LIMIT maxRows + 1, so the count itself is bounded and nothing is loaded into Node over a cap.
async function assertWithinScrubCaps(client: pg.PoolClient, patterns: string[], caps: ScrubCaps): Promise<void> {
  const { maxBytes, maxRows } = caps;
  const { rows: measured } = await client.query<{ bytes: string; row_count: string }>(
    `SELECT count(*) AS row_count, coalesce(sum(length(payload::text)), 0) AS bytes
     FROM (SELECT payload FROM purchase_events WHERE ${CANDIDATE_FILTER} LIMIT $4) AS bounded`,
    [...patterns, maxRows + 1],
  );
  const [{ bytes, row_count: rowCount }] = measured;
  if (Number(rowCount) > maxRows || Number(bytes) > maxBytes) {
    throw new DeletionTooLargeError();
  }
}

async function scrubPurchaseEvents(
  client: pg.PoolClient,
  identity: { email: string; userId: string },
  caps: ScrubCaps,
): Promise<void> {
  const { email, userId } = identity;
  const { maxRows } = caps;
  const patterns = [userId, containsPattern(email), containsPattern(userId)];
  await assertWithinScrubCaps(client, patterns, caps);
  // The SQL is a superset (it also folds NFKC forms and takes every payload holding a `%` or a fullwidth `％`, which
  // may carry the email or id percent-encoded); it takes no row lock. The JS predicate chooses the rows, and only
  // those are locked. The read stays bounded too: rows committed after the measure cannot push it past the cap.
  const { rows: candidates } = await client.query<PurchaseEventRow>(
    `SELECT provider, provider_event_id, payload, user_id FROM purchase_events
     WHERE ${CANDIDATE_FILTER} LIMIT $4`,
    [...patterns, maxRows + 1],
  );
  if (candidates.length > maxRows) {
    throw new DeletionTooLargeError();
  }
  const chosen = candidates.filter(({ payload, user_id: rowUserId }) =>
    isChosenRow(rowUserId, payload, userId, identity),
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
    .filter(({ payload, user_id: rowUserId }) => isChosenRow(rowUserId, payload, userId, identity))
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
  const {
    rateLimitKeySecret,
    scrubMaxBytes = AUTH.DELETION.SCRUB_MAX_BYTES,
    scrubMaxRows = AUTH.DELETION.SCRUB_MAX_ROWS,
    statementTimeoutMs = AUTH.DELETION.STATEMENT_TIMEOUT_MS,
    userId,
  } = input;
  // set_config(..., true) is SET LOCAL with bind parameters; a bare number is read as milliseconds.
  await client.query("SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)", [
    String(AUTH.DELETION.LOCK_TIMEOUT_MS),
    String(statementTimeoutMs),
  ]);
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
  await scrubPurchaseEvents(client, { email, userId }, { maxBytes: scrubMaxBytes, maxRows: scrubMaxRows });
  await deleteRateLimitCountersForEmail(client, rateLimitKeySecret, email);
  await deleteRateLimitCountersForUser(client, rateLimitKeySecret, userId);
  await client.query('DELETE FROM users WHERE id = $1', [userId]);
  return true;
}

export { deleteUser };
