// Takes the user's row lock without waiting (FOR UPDATE NOWAIT), so a second upload or profile
// update for the same user is refused at once instead of queueing. Returns the locked row or
// 'missing' when the user is gone. Throws UserBusyError only for the NOWAIT refusal (55P03 with
// the "could not obtain lock on row" message); a lock_timeout (also 55P03, "canceling statement
// due to lock timeout") and every other error are rethrown unchanged.
import type pg from 'pg';

import { TRANSACTION_TIMEOUTS } from '../constants/transactionTimeouts.js';
import { UserBusyError } from '../errors/UserBusyError.js';
import type { LockedUser } from '../types/LockedUser.js';
import type { UserLockResult } from '../types/UserLockResult.js';

const NOWAIT_MESSAGE_PREFIX = 'could not obtain lock on row';

function isNowaitRefusal(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return (
    code === TRANSACTION_TIMEOUTS.LOCK_TIMEOUT_CODE &&
    typeof message === 'string' &&
    message.startsWith(NOWAIT_MESSAGE_PREFIX)
  );
}

async function lockUserRow(client: pg.PoolClient, userId: string): Promise<UserLockResult> {
  try {
    const { rows } = await client.query<LockedUser>(
      'SELECT created_at, timezone, progress_timezone FROM users WHERE id = $1 FOR UPDATE NOWAIT',
      [userId],
    );
    const [user] = rows;
    return user ? { kind: 'locked', user } : { kind: 'missing' };
  } catch (error) {
    if (isNowaitRefusal(error)) {
      throw new UserBusyError();
    }
    throw error;
  }
}

export { lockUserRow };
