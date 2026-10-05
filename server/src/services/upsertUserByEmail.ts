// Finds or creates the user for a normalized email inside the caller's transaction, storing the
// device's timezone only when it is a valid IANA zone and the user has none.
import type pg from 'pg';

import { isValidTimeZone } from './isValidTimeZone.js';

interface UpsertUserInput {
  // Already normalized by the request schema.
  email: string;
  timezone: string | undefined;
}

interface UpsertedUser {
  // True when this call inserted the row; xmax is 0 only on a fresh insert.
  isCreated: boolean;
  userId: string;
}

async function upsertUserByEmail(client: pg.PoolClient, input: UpsertUserInput): Promise<UpsertedUser> {
  const { email, timezone } = input;
  const storedZone = timezone !== undefined && isValidTimeZone(timezone) ? timezone : null;
  const { rows } = await client.query<{ id: string; is_created: boolean }>(
    `INSERT INTO users (email, timezone) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET timezone = COALESCE(users.timezone, EXCLUDED.timezone)
     RETURNING id, (xmax = 0) AS is_created`,
    [email, storedZone],
  );
  const [{ id: userId, is_created: isCreated }] = rows;
  return { isCreated, userId };
}

export { upsertUserByEmail };
