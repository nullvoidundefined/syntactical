// Hands back an answer reserveAskUsage took when the model call failed or declined, so only
// answers actually given count toward the daily limit. Never goes below zero.
import type { Database } from '../clients/database.js';

async function releaseAskUsage(database: Database, userId: string, usageDate: string): Promise<void> {
  await database.query('UPDATE ask_usage SET count = count - 1 WHERE user_id = $1 AND usage_date = $2 AND count > 0', [
    userId,
    usageDate,
  ]);
}

export { releaseAskUsage };
