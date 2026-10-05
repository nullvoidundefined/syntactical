// Inserts a session row inside the caller's transaction: the SHA-256 of 32 random bytes with a
// 30-day absolute expiry, and the method that opened it. The plaintext token is returned once,
// to be handed to the client, and never stored.
import { randomBytes } from 'node:crypto';

import type pg from 'pg';

import { AUTH } from '../constants/auth.js';

import { sha256 } from './sha256.js';

const {
  SESSION: { ABSOLUTE_TTL_MS, TOKEN_BYTES },
} = AUTH;

interface InsertSessionInput {
  authMethod: 'code' | 'password';
  now: Date;
  userId: string;
}

async function insertSession(client: pg.PoolClient, input: InsertSessionInput): Promise<{ sessionToken: string }> {
  const { authMethod, now, userId } = input;
  const sessionToken = randomBytes(TOKEN_BYTES).toString('base64url');
  await client.query(
    `INSERT INTO sessions (user_id, token_hash, created_at, last_used_at, expires_at, auth_method)
     VALUES ($1, $2, $3, $3, $4, $5)`,
    [userId, sha256(sessionToken), now, new Date(now.getTime() + ABSOLUTE_TTL_MS), authMethod],
  );
  return { sessionToken };
}

export { insertSession };
