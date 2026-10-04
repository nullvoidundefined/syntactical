// Runs work inside one Postgres transaction on a pooled client: COMMIT when the work resolves,
// ROLLBACK when it throws. Every transaction is bounded by a transaction-local statement and lock
// timeout (the error handler answers either with 503 SERVER_BUSY), so nothing leaks onto the
// pooled connection. A client whose ROLLBACK fails is destroyed instead of returned to the pool,
// so a broken connection never serves the next request. The pool drops its idle error listener
// on checkout, so a listener lives here for the checkout: a backend that dies mid-work
// (pg_terminate_backend) would otherwise emit an unhandled error and crash the process. The
// failure still surfaces on the pending or next query, and release(error) destroys the client.
import type pg from 'pg';

import type { Database } from './database.js';

const STATEMENT_TIMEOUT = '5s';
const LOCK_TIMEOUT = '2s';

function ignoreClientError(): void {
  // Value-free on purpose: pg errors can carry user data. The query that fails reports the cause.
}

async function withTransaction<T>(database: Database, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  client.on('error', ignoreClientError);
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $2, true)", [
      STATEMENT_TIMEOUT,
      LOCK_TIMEOUT,
    ]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      releaseError = rollbackError instanceof Error ? rollbackError : new Error('rollback failed');
    });
    throw error;
  } finally {
    client.removeListener('error', ignoreClientError);
    client.release(releaseError);
  }
}

export { withTransaction };
