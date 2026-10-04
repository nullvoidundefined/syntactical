// The e2e run's Postgres: one throwaway postgres:17 container with a run-time passphrase, bound to
// a loopback port and labelled with this process id. Containers carrying the label whose process
// is gone (a killed earlier run) are removed first; a container without the label is never
// touched. stop() removes only the container this run started.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import pg from 'pg';

const OWNER_LABEL = 'syntactical-e2e-db';
const IMAGE = 'postgres:17';
const PASSPHRASE_BYTES = 24;
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 250;

function docker(args: string[], extraEnv: NodeJS.ProcessEnv = {}): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function removeOrphans(): void {
  const listing = docker([
    'ps',
    '-a',
    '--filter',
    `label=${OWNER_LABEL}`,
    '--format',
    `{{.ID}} {{.Label "${OWNER_LABEL}"}}`,
  ]);
  for (const line of listing.split('\n').filter(Boolean)) {
    const [id = '', owner = ''] = line.trim().split(/\s+/);
    const pid = Number(owner);
    if (id && Number.isInteger(pid) && pid > 0 && !isProcessAlive(pid)) docker(['rm', '-f', id]);
  }
}

async function waitUntilReady(databaseUrl: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const client = new pg.Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await delay(READY_POLL_MS);
    }
  }
  throw new Error(`Postgres did not accept connections within ${READY_TIMEOUT_MS} ms`);
}

async function startDatabase(): Promise<{ databaseUrl: string; stop: () => void }> {
  removeOrphans();
  const passphrase = randomBytes(PASSPHRASE_BYTES).toString('hex');
  // The passphrase reaches docker through the environment, never the argument list.
  const containerId = docker(
    [
      'run',
      '-d',
      '--rm',
      '--label',
      `${OWNER_LABEL}=${process.pid}`,
      '-e',
      'POSTGRES_PASSWORD',
      '-p',
      '127.0.0.1::5432/tcp',
      IMAGE,
    ],
    { POSTGRES_PASSWORD: passphrase },
  );
  function stop(): void {
    docker(['rm', '-f', containerId]);
  }
  try {
    const [binding = ''] = docker(['port', containerId, '5432/tcp']).split('\n');
    const port = binding.slice(binding.lastIndexOf(':') + 1);
    const databaseUrl = `postgres://postgres:${passphrase}@127.0.0.1:${port}/postgres`;
    await waitUntilReady(databaseUrl);
    return { databaseUrl, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

export { startDatabase };
