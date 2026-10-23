// Takes one of a user's daily answers before the model is called, in one atomic statement, so
// concurrent asks cannot pass the limit together. Resolves the count used today including this
// one, or null when the limit is already reached. The same statement prunes the user's earlier
// dates. A failed model call hands the answer back with releaseAskUsage.
import type { Database } from '../clients/database.js';

async function reserveAskUsage(
  database: Database,
  userId: string,
  usageDate: string,
  limit: number,
): Promise<number | null> {
  const { rows } = await database.query<{ count: number }>(
    `WITH pruned AS (DELETE FROM ask_usage WHERE user_id = $1 AND usage_date < $2)
     INSERT INTO ask_usage (user_id, usage_date, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ask_usage.count + 1
     WHERE ask_usage.count < $3
     RETURNING count`,
    [userId, usageDate, limit],
  );
  const [row] = rows;
  return row ? row.count : null;
}

export { reserveAskUsage };
