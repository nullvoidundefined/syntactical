// Runs work inside one Postgres transaction on a pooled client: COMMIT when the work resolves,
// ROLLBACK when it throws. A client whose ROLLBACK fails is destroyed instead of returned to
// the pool, so a broken connection never serves the next request.
import type pg from 'pg';

import type { Database } from './database.js';

async function withTransaction<T>(database: Database, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
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
    client.release(releaseError);
  }
}

export { withTransaction };
