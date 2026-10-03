// Takes the user's row lock without waiting (FOR UPDATE NOWAIT), so a second upload or profile
// update for the same user is refused at once instead of queueing. Returns the locked row,
// 'missing' when the user is gone, or 'busy' when Postgres raises lock_not_available (55P03)
// for this statement; any other error is rethrown. Busy is tied to this statement alone, so a
// later lock_timeout elsewhere is never mistaken for it.
import type pg from 'pg';

import type { LockedUser } from '../types/LockedUser.js';
import type { UserLockResult } from '../types/UserLockResult.js';

const LOCK_NOT_AVAILABLE = '55P03';

function isLockNotAvailable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === LOCK_NOT_AVAILABLE;
}

async function lockUserRow(client: pg.PoolClient, userId: string): Promise<UserLockResult> {
  try {
    const { rows } = await client.query<LockedUser>(
      'SELECT created_at, timezone FROM users WHERE id = $1 FOR UPDATE NOWAIT',
      [userId],
    );
    const [user] = rows;
    return user ? { kind: 'locked', user } : { kind: 'missing' };
  } catch (error) {
    if (isLockNotAvailable(error)) {
      return { kind: 'busy' };
    }
    throw error;
  }
}

export { lockUserRow };
