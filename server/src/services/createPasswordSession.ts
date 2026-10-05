// Opens a password session after verifyUserPassword (B-68, B-85): one short transaction locks the
// user row, requires the stored hash to still be the verified one, writes the rehash if there
// is one, fills an empty timezone, and inserts the session. Resolves { sessionToken }, or null
// (writing nothing) when the stored hash changed or the user is gone. It never creates a user.
import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';

import { insertSession } from './insertSession.js';
import { isValidTimeZone } from './isValidTimeZone.js';

interface CreatePasswordSessionInput {
  now: Date;
  rehash: string | undefined;
  timezone: string | undefined;
  userId: string;
  verifiedHash: string;
}

async function createPasswordSession(
  database: Database,
  input: CreatePasswordSessionInput,
): Promise<{ sessionToken: string } | null> {
  const { now, rehash, timezone, userId, verifiedHash } = input;
  return withTransaction(database, async (client) => {
    const { rows } = await client.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (rows[0]?.password_hash !== verifiedHash) {
      return null;
    }
    if (rehash !== undefined) {
      await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, rehash]);
    }
    if (timezone !== undefined && isValidTimeZone(timezone)) {
      await client.query('UPDATE users SET timezone = $2 WHERE id = $1 AND timezone IS NULL', [userId, timezone]);
    }
    return insertSession(client, { authMethod: 'password', now, userId });
  });
}

export { createPasswordSession };
