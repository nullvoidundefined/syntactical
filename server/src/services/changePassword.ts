// The password change's one transaction (B-80 to B-82, B-85), after the route has authorized the
// caller and derived the new hash holding no pooled client. Locks the user row and requires the
// stored hash to still be the one the route read before verifying ('changed' otherwise, nothing
// written); locks and re-checks that the requesting session is still live, so two fresh code
// sessions cannot each change the password and revoke the other ('session-gone' otherwise,
// nothing written); stores the hash and password_updated_at; and revokes the user's other
// sessions. Nothing here logs or returns a hash.
import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';

import { lockUserPasswordHash } from './lockUserPasswordHash.js';

interface ChangePasswordInput {
  newHash: string;
  now: Date;
  sessionId: string;
  // The hash the route read before verifying; null for a user who had none.
  storedHash: string | null;
  userId: string;
}

type ChangePasswordOutcome = 'changed' | 'saved' | 'session-gone';

async function changePassword(database: Database, input: ChangePasswordInput): Promise<ChangePasswordOutcome> {
  const { newHash, now, sessionId, storedHash, userId } = input;
  return withTransaction(database, async (client) => {
    if ((await lockUserPasswordHash(client, userId)) !== storedHash) {
      return 'changed';
    }
    const live = await client.query(
      'SELECT 1 FROM sessions WHERE id = $1 AND revoked_at IS NULL AND expires_at > $2 FOR UPDATE',
      [sessionId, now],
    );
    if (live.rowCount !== 1) {
      return 'session-gone';
    }
    await client.query('UPDATE users SET password_hash = $2, password_updated_at = $3 WHERE id = $1', [
      userId,
      newHash,
      now,
    ]);
    await client.query('UPDATE sessions SET revoked_at = $3 WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [
      userId,
      sessionId,
      now,
    ]);
    return 'saved';
  });
}

export { changePassword };
export type { ChangePasswordInput, ChangePasswordOutcome };
