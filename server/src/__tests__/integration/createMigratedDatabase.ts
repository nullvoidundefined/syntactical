// A scratch database with every migration applied, for integration tests that
// exercise application SQL. reset() empties the application tables between
// tests; drop() closes the pool and removes the database.
import type pg from 'pg';

import { createScratchDatabase } from './createScratchDatabase.js';
import { runMigrations } from './runMigrations.js';

const SUCCESS = 0;

export async function createMigratedDatabase(
    adminUrl: string,
): Promise<{ databaseUrl: string; drop: () => Promise<void>; pool: pg.Pool; reset: () => Promise<void> }> {
    const scratch = await createScratchDatabase(adminUrl);
    const { output, status } = runMigrations(scratch.databaseUrl, 'up');
    if (status !== SUCCESS) {
        await scratch.drop();
        throw new Error(`migrations failed: ${output}`);
    }
    const { databaseUrl, drop, pool } = scratch;
    async function reset(): Promise<void> {
        await pool.query('TRUNCATE users, one_time_codes, sessions, rate_limit_counters CASCADE');
    }
    return { databaseUrl, drop, pool, reset };
}
