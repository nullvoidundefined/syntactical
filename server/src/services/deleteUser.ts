// Deletes a user and everything derived from them (B-59), on the caller's transaction client.
// The email's advisory lock (the key issueOneTimeCode takes) keeps an in-flight code issue from
// leaving a fresh code behind. The email's one-time codes and email-keyed rate-limit counters
// go, then the user row: sessions, answer events, progress, and goal changes cascade, and
// entitlements and purchase_events keep their rows with user_id null by foreign key. Purchase
// payloads hold no email or name (the webhook stores an allowlisted projection, B-39), so
// nothing else holds the identity. Resolves false when the user is already gone, as for a
// second concurrent delete.
import type pg from 'pg';

import { deleteRateLimitCountersForEmail } from './deleteRateLimitCountersForEmail.js';
import { normalizeEmail } from './normalizeEmail.js';

interface DeleteUserInput {
  rateLimitKeySecret: string;
  userId: string;
}

async function deleteUser(client: pg.PoolClient, input: DeleteUserInput): Promise<boolean> {
  const { rateLimitKeySecret, userId } = input;
  const { rows } = await client.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  const [row] = rows;
  if (!row) {
    return false;
  }
  const email = normalizeEmail(row.email);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [email]);
  await client.query('DELETE FROM one_time_codes WHERE email = $1', [email]);
  await deleteRateLimitCountersForEmail(client, rateLimitKeySecret, email);
  const { rowCount } = await client.query('DELETE FROM users WHERE id = $1', [userId]);
  return rowCount === 1;
}

export { deleteUser };
