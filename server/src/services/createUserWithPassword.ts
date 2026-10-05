// Finds or creates the user for an email and stores the given password hash only on a user this
// call created (B-74): an existing user, with a hash or without, is signed in and changed in no
// way but an empty timezone. Sign-up never writes a hash onto an existing account. Runs inside
// the caller's transaction; isPasswordApplied says whether the hash was stored.
import type pg from 'pg';

import { upsertUserByEmail } from './upsertUserByEmail.js';

interface CreateUserWithPasswordInput {
  // Already normalized by the request schema.
  email: string;
  now: Date;
  passwordHash: string;
  timezone: string | undefined;
}

interface CreatedUser {
  isPasswordApplied: boolean;
  userId: string;
}

async function createUserWithPassword(client: pg.PoolClient, input: CreateUserWithPasswordInput): Promise<CreatedUser> {
  const { email, now, passwordHash, timezone } = input;
  const { isCreated, userId } = await upsertUserByEmail(client, { email, timezone });
  if (isCreated) {
    await client.query('UPDATE users SET password_hash = $2, password_updated_at = $3 WHERE id = $1', [
      userId,
      passwordHash,
      now,
    ]);
  }
  return { isPasswordApplied: isCreated, userId };
}

export { createUserWithPassword };
