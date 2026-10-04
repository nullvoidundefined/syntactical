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

// pool.end() resolves once the pool has forgotten its idle clients, before their sockets have
// closed. Dropping the database WITH (FORCE) in that window terminates a backend that is still
// closing (57P01), and the client's idle listener re-emits that on the pool as an unhandled
// error. Waiting for every client's 'remove' event means every backend is gone first.
async function endPool(pool: pg.Pool): Promise<void> {
    const { totalCount } = pool;
    let removedCount = 0;
    const allRemoved = new Promise<void>((resolve) => {
        if (totalCount === 0) {
            resolve();
            return;
        }
        pool.on('remove', () => {
            removedCount += 1;
            if (removedCount === totalCount) {
                resolve();
            }
        });
    });
    await pool.end();
    await allRemoved;
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
        await endPool(pool);
        await onAdmin(adminUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    return { databaseUrl, drop, pool };
}
