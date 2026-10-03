// The integration tests' Postgres: the local database TEST_DATABASE_URL names
// (CI's service container), or else a throwaway container started with a
// passphrase generated at run time. Provides its admin URL as
// `testDatabaseUrl` and returns the teardown, which stops only that container.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import pg from 'pg';

import { assertLocalDatabaseUrl } from './assertLocalDatabaseUrl.js';
import { startTestContainer } from './startTestContainer.js';

const PASSPHRASE_BYTES = 24;
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 250;

function docker(args: string[], env: NodeJS.ProcessEnv = process.env): string {
    return execFileSync('docker', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function waitUntilReady(databaseUrl: string): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastError: unknown;
    while (Date.now() < deadline) {
        const client = new pg.Client({ connectionString: databaseUrl });
        try {
            await client.connect();
            // A readiness probe, bounded by READY_TIMEOUT_MS / READY_POLL_MS attempts.
            // eslint-disable-next-line dataAccess/no-query-in-loop
            await client.query('SELECT 1');
            await client.end();
            return;
        } catch (error) {
            lastError = error;
            await client.end().catch((endError: unknown) => {
                lastError = endError;
            });
            await delay(READY_POLL_MS);
        }
    }
    const { code } = (lastError ?? {}) as { code?: string };
    throw new Error(
        `Postgres did not accept connections within ${READY_TIMEOUT_MS} ms (last error code: ${code ?? 'none'})`,
    );
}

export async function setupTestDatabase(
    provide: (key: 'testDatabaseUrl', value: string) => void,
): Promise<() => void> {
    const { TEST_DATABASE_URL: configuredUrl } = process.env;
    if (configuredUrl) {
        assertLocalDatabaseUrl(configuredUrl);
        await waitUntilReady(configuredUrl);
        provide('testDatabaseUrl', configuredUrl);
        return () => undefined;
    }
    // Matches the pipeline's Docker tests; the migrations tests skip themselves too.
    if (process.env.SKIP_DOCKER_TESTS === '1') {
        return () => undefined;
    }
    const { containerId, databaseUrl } = startTestContainer(docker, randomBytes(PASSPHRASE_BYTES).toString('hex'));
    function stopContainer(): void {
        docker(['stop', containerId]);
    }
    try {
        await waitUntilReady(databaseUrl);
    } catch (error) {
        stopContainer();
        throw error;
    }
    provide('testDatabaseUrl', databaseUrl);
    return stopContainer;
}
