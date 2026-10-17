// Locks the user row for the rest of the caller's transaction and reads its password hash (B-85).
// Both password paths compare the result to the hash they read before a derivation, holding no
// client, and write nothing when it changed in between. Resolves the hash (null for a user with
// no password), or undefined when there is no row, so a missing user compares as "changed".
import type pg from 'pg';

async function lockUserPasswordHash(client: pg.PoolClient, userId: string): Promise<string | null | undefined> {
  const { rows } = await client.query<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  );
  return rows[0]?.password_hash;
}

export { lockUserPasswordHash };
