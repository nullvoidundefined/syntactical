// Locks the user's row (SELECT ... FOR UPDATE) for the rest of the caller's transaction, so one
// user's uploads and profile updates run one at a time: a second one waits for the first, up to
// the transaction's lock timeout. The download cursor depends on this order (migration 010).
// Undefined when the user is gone.
import type pg from 'pg';

import type { LockedUser } from '../types/LockedUser.js';

async function lockUserRow(client: pg.PoolClient, userId: string): Promise<LockedUser | undefined> {
  const { rows } = await client.query<LockedUser>('SELECT created_at, timezone FROM users WHERE id = $1 FOR UPDATE', [
    userId,
  ]);
  return rows[0];
}

export { lockUserRow };
