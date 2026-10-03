// An empty database of its own for one integration test, created on the local
// Postgres globalSetup provides. drop() closes the pool and removes it.
import { randomBytes } from 'node:crypto';

import pg from 'pg';

const NAME_BYTES = 6;

async function onAdmin(adminUrl: string, sql: string): Promise<void> {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    try {
        await admin.query(sql);
    } finally {
        await admin.end();
    }
}

export async function createScratchDatabase(
    adminUrl: string,
): Promise<{ databaseUrl: string; drop: () => Promise<void>; pool: pg.Pool }> {
    const name = `scratch_${randomBytes(NAME_BYTES).toString('hex')}`;
    await onAdmin(adminUrl, `CREATE DATABASE ${name}`);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    const databaseUrl = url.toString();
    const pool = new pg.Pool({ connectionString: databaseUrl });
    async function drop(): Promise<void> {
        await pool.end();
        await onAdmin(adminUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    return { databaseUrl, drop, pool };
}
