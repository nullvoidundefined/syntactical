// Deletes every rate-limit counter keyed by an email, in every email scope, so account
// deletion leaves no row derived from the address. The keys are recomputed with the server's
// secret; the stored HMACs cannot be reversed to find them.
import type pg from 'pg';

import { AUTH } from '../constants/auth.js';

import { normalizeEmail } from './normalizeEmail.js';
import { rateLimitKey } from './rateLimitKey.js';

// The pool or a transaction's client: anything that can run a query.
type Queryable = Pick<pg.PoolClient, 'query'>;

const EMAIL_SCOPES = Object.values(AUTH.RATE_LIMIT_SCOPE).filter((scope) => scope.endsWith(':email'));

async function deleteRateLimitCountersForEmail(database: Queryable, keySecret: string, email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const keys = EMAIL_SCOPES.map((scope) => rateLimitKey(keySecret, scope, normalized));
  await database.query('DELETE FROM rate_limit_counters WHERE key = ANY($1)', [keys]);
}

export { deleteRateLimitCountersForEmail };
