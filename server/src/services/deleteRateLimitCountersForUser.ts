// Deletes every rate-limit counter keyed by a user id, in every window, so account deletion
// leaves no `account-delete:user` row for the deleted user (B-59.12). The key is recomputed
// with the server's secret; it is the same in every window, so one match covers them all.
import type pg from 'pg';

import { AUTH } from '../constants/auth.js';

import { rateLimitKey } from './rateLimitKey.js';

// The pool or a transaction's client: anything that can run a query.
type Queryable = Pick<pg.PoolClient, 'query'>;

async function deleteRateLimitCountersForUser(database: Queryable, keySecret: string, userId: string): Promise<void> {
  const key = rateLimitKey(keySecret, AUTH.RATE_LIMIT_SCOPE.DELETE_USER, userId);
  await database.query('DELETE FROM rate_limit_counters WHERE key = $1', [key]);
}

export { deleteRateLimitCountersForUser };
