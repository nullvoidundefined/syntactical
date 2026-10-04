// Starts everything the specs run against, and returns the function that removes it: a throwaway
// Postgres, the real migrations, the real API (through startServer, with sign-in codes captured to
// a file), the web export built against that API, and a static host for it. The state directory
// holds the run's private files and is deleted at the end.
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { apiOrigin, apiPort, BASE_PATH, STATE_DIR_VARIABLE, webOrigin, webPort } from './support/e2eEnv';
import type { E2eState } from './support/e2eEnv';
import { startDatabase } from './support/startDatabase';
import { startWebHost } from './support/startWebHost';
import { writeFixtureContent } from './support/writeFixtureContent';

const REPOSITORY_ROOT = join(__dirname, '..');
const SECRET_BYTES = 24;
const API_READY_TIMEOUT_MS = 60_000;
const API_READY_POLL_MS = 250;
const LOG_TAIL_CHARS = 4000;

function runStep(label: string, command: string, args: string[], env: NodeJS.ProcessEnv = {}): void {
  const { status, stderr, stdout } = spawnSync(command, args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (status !== 0) {
    throw new Error(`${label} failed (exit ${status}):\n${`${stdout}${stderr}`.slice(-LOG_TAIL_CHARS)}`);
  }
}

async function waitForApi(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + API_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('The e2e API exited before it was ready');
    try {
      if ((await fetch(`${apiOrigin}/health/ready`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await delay(API_READY_POLL_MS);
  }
  throw new Error('The e2e API did not become ready');
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const stateDir = await mkdtemp(join(tmpdir(), 'syntactical-e2e-'));
  const stops: Array<() => Promise<void> | void> = [];
  async function tearDown(): Promise<void> {
    for (const stop of stops.reverse()) {
      try {
        await stop();
      } catch {
        // Keep removing the rest.
      }
    }
    await rm(stateDir, { force: true, recursive: true });
  }
  try {
    const publicDir = join(stateDir, 'public');
    const paidDir = join(stateDir, 'paid');
    const webDir = join(stateDir, 'web');
    const codesFile = join(stateDir, 'codes.jsonl');
    await mkdir(publicDir);
    await mkdir(paidDir);

    const database = await startDatabase();
    stops.push(database.stop);
    const { databaseUrl } = database;

    runStep('building the shared packages', 'npm', [
      'run',
      '--silent',
      'build',
      '-w',
      '@syntactical/content-schema',
      '-w',
      '@syntactical/progress',
    ]);
    runStep('running migrations', 'npm', ['run', '--silent', 'migrate:up', '-w', 'server'], {
      DATABASE_URL: databaseUrl,
    });
    await writeFixtureContent({ contentSource: join(REPOSITORY_ROOT, 'content'), paidDir, publicDir });

    const apiLog = createWriteStream(join(stateDir, 'api.log'));
    const api = spawn(process.execPath, ['--import', 'tsx', join(REPOSITORY_ROOT, 'e2e/support/runApi.mts')], {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        ALLOWED_ORIGINS: webOrigin,
        ALLOW_STUBBED_INTEGRATIONS: 'true',
        CONTENT_DIR: publicDir,
        DATABASE_URL: databaseUrl,
        E2E_CODES_FILE: codesFile,
        EMAIL_FROM: 'Syntactical <e2e@example.test>',
        NODE_ENV: 'test',
        PAID_CONTENT_DIR: paidDir,
        PORT: String(apiPort),
        PUBLIC_BASE_URL: webOrigin.replace('http:', 'https:'),
        RATE_LIMIT_KEY_SECRET: randomBytes(SECRET_BYTES).toString('hex'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    api.stdout?.pipe(apiLog);
    api.stderr?.pipe(apiLog);
    stops.push(async () => {
      api.kill('SIGTERM');
      await delay(500);
      apiLog.end();
    });
    await waitForApi(api);

    runStep('building the web export', 'npx', ['expo', 'export', '--platform', 'web', '--output-dir', webDir], {
      CI: '1',
      E2E_API_BASE_URL: `${apiOrigin}/v1/`,
      E2E_CONTENT_BASE_URL: `${webOrigin}${BASE_PATH}/content/`,
      EXPO_NO_TELEMETRY: '1',
    });
    const webHost = await startWebHost({ contentDir: publicDir, port: webPort, webDir });
    stops.push(
      () =>
        new Promise<void>((resolve) => {
          webHost.close(() => resolve());
          webHost.closeAllConnections();
        }),
    );

    const state: E2eState = {
      apiUrl: apiOrigin,
      codesFile,
      contentDir: publicDir,
      databaseUrl,
      paidContentDir: paidDir,
      webUrl: `${webOrigin}${BASE_PATH}/`,
    };
    await writeFile(join(stateDir, 'state.json'), JSON.stringify(state), { mode: 0o600 });
    process.env[STATE_DIR_VARIABLE] = stateDir;
    return tearDown;
  } catch (error) {
    await tearDown();
    throw error;
  }
}
