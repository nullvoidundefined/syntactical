// Runs work inside one Postgres transaction on a pooled client: COMMIT when the work resolves,
// ROLLBACK when it throws. A client whose ROLLBACK fails is destroyed instead of returned to
// the pool, so a broken connection never serves the next request. The pool drops its idle error
// listener on checkout, so a listener lives here for the checkout: a backend that dies mid-work
// (25P03, pg_terminate_backend) would otherwise emit an unhandled error and crash the process.
// The failure still surfaces on the pending or next query, and release(error) destroys the client.
import type pg from 'pg';

import type { Database } from './database.js';

async function withTransaction<T>(database: Database, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  // Value-free on purpose: pg errors can carry user data. The query that fails reports the cause.
  const ignoreClientError = (): void => undefined;
  client.on('error', ignoreClientError);
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
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
