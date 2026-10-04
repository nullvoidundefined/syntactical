// Runs work inside withTransaction after setting the statement, lock, and idle-in-transaction
// timeouts for that transaction only (SET LOCAL), so nothing leaks onto the pooled connection.
import type pg from 'pg';

import { TRANSACTION_TIMEOUTS } from '../constants/transactionTimeouts.js';

import type { Database } from './database.js';
import { withTransaction } from './withTransaction.js';

async function withBoundedTransaction<T>(
  database: Database,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const { IDLE_IN_TRANSACTION_SESSION, LOCK, STATEMENT } = TRANSACTION_TIMEOUTS;
  return withTransaction(database, async (client) => {
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT}'`);
    await client.query(`SET LOCAL lock_timeout = '${LOCK}'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${IDLE_IN_TRANSACTION_SESSION}'`);
    return work(client);
  });
}

export { withBoundedTransaction };
