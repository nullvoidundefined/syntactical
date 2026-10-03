// Creates a session inside the caller's transaction (B-27): finds or creates the user by
// normalized email (storing the device's timezone only when it is a valid IANA zone and the
// user has none), then stores the SHA-256 of 32 random bytes with a 30-day absolute expiry.
// The plaintext token is returned once, to be handed to the client, and never stored.
import { randomBytes } from 'node:crypto';

import type pg from 'pg';

import { AUTH } from '../constants/auth.js';

import { isValidTimeZone } from './isValidTimeZone.js';
import { sha256 } from './sha256.js';

const {
  SESSION: { ABSOLUTE_TTL_MS, TOKEN_BYTES },
} = AUTH;

interface CreateSessionInput {
  // Already normalized by the request schema.
  email: string;
  now: Date;
  timezone: string | undefined;
}

interface CreatedSession {
  sessionToken: string;
  userId: string;
}

async function createSession(client: pg.PoolClient, input: CreateSessionInput): Promise<CreatedSession> {
  const { email, now, timezone } = input;
  const storedZone = timezone !== undefined && isValidTimeZone(timezone) ? timezone : null;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (email, timezone) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET timezone = COALESCE(users.timezone, EXCLUDED.timezone)
     RETURNING id`,
    [email, storedZone],
  );
  const [{ id: userId }] = rows;
  const sessionToken = randomBytes(TOKEN_BYTES).toString('base64url');
  await client.query(
    `INSERT INTO sessions (user_id, token_hash, created_at, last_used_at, expires_at)
     VALUES ($1, $2, $3, $3, $4)`,
    [userId, sha256(sessionToken), now, new Date(now.getTime() + ABSOLUTE_TTL_MS)],
  );
  return { sessionToken, userId };
}

export { createSession };
