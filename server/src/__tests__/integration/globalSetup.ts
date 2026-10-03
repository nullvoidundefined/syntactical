// Vitest globalSetup for the server integration tests. It provides the URL of
// a local Postgres admin database: the one TEST_DATABASE_URL names (CI's
// service container), or else a throwaway postgres:17 container this run
// starts on a loopback port with a passphrase generated at run time, and stops
// (only that container id) in teardown. Tests create their own scratch
// databases from it, so only a local server is accepted.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import pg from 'pg';
import type { TestProject } from 'vitest/node';

const POSTGRES_IMAGE = 'postgres:17';
const CONTAINER_PORT = '5432/tcp';
const POSTGRES_USER = 'postgres';
const PASSPHRASE_ENV = 'POSTGRES_PASSWORD';
const PASSPHRASE_BYTES = 24;
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 250;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function docker(args: string[], env: NodeJS.ProcessEnv = process.env): string {
    return execFileSync('docker', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function assertLocal(databaseUrl: string): void {
    const { hostname } = new URL(databaseUrl);
    if (!LOCAL_HOSTS.has(hostname)) {
        throw new Error(
            'TEST_DATABASE_URL must point at a local Postgres; the integration tests create and drop databases',
        );
    }
}

async function waitUntilReady(databaseUrl: string): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastError: unknown;
    while (Date.now() < deadline) {
        const client = new pg.Client({ connectionString: databaseUrl });
        try {
            await client.connect();
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

function startContainer(passphrase: string): { containerId: string; databaseUrl: string } {
    // The passphrase reaches docker through the environment, never the argument list.
    const containerId = docker(
        ['run', '-d', '--rm', '-e', PASSPHRASE_ENV, '-p', `127.0.0.1::${CONTAINER_PORT}`, POSTGRES_IMAGE],
        { ...process.env, [PASSPHRASE_ENV]: passphrase },
    );
    const [binding = ''] = docker(['port', containerId, CONTAINER_PORT]).split('\n');
    const port = binding.slice(binding.lastIndexOf(':') + 1);
    return {
        containerId,
        databaseUrl: `postgres://${POSTGRES_USER}:${passphrase}@127.0.0.1:${port}/${POSTGRES_USER}`,
    };
}

export default async function setup({ provide }: TestProject): Promise<() => void> {
    const { TEST_DATABASE_URL: configuredUrl } = process.env;
    if (configuredUrl) {
        assertLocal(configuredUrl);
        await waitUntilReady(configuredUrl);
        provide('testDatabaseUrl', configuredUrl);
        return () => undefined;
    }
    const { containerId, databaseUrl } = startContainer(randomBytes(PASSPHRASE_BYTES).toString('hex'));
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
