// Creates a code session inside the caller's transaction (B-27): finds or creates the user by
// normalized email, then inserts the session. The plaintext token is returned once, to be handed
// to the client, and never stored.
import type pg from 'pg';

import { insertSession } from './insertSession.js';
import { upsertUserByEmail } from './upsertUserByEmail.js';

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
  const { userId } = await upsertUserByEmail(client, { email, timezone });
  const { sessionToken } = await insertSession(client, { authMethod: 'code', now, userId });
  return { sessionToken, userId };
}

export { createSession };
