// The Railway upload guard in server/scripts/deployToRailway.sh: a staged build context that holds
// a key, an env file, or git metadata must stop the deploy before anything reaches Railway.
// DEPLOY_DRY_RUN stops the script before it contacts Railway; DEPLOY_ROOT points it at a scratch repo.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../../scripts/deployToRailway.sh', import.meta.url));

// Child git and bash runs must not inherit GIT_* from a parent hook, or they act on the real repo.
function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_') && key !== 'RAILWAY_TOKEN') env[key] = value;
  }
  return { ...env, ...extra };
}

function git(root: string, ...args: string[]): void {
  const result = spawnSync('git', ['-C', root, ...args], { env: cleanEnv({}), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

function runDeploy(root: string) {
  return spawnSync('bash', [script, 'staging', '0.0.0'], {
    env: cleanEnv({ DEPLOY_DRY_RUN: '1', DEPLOY_ROOT: root }),
    encoding: 'utf8',
  });
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deploy-guard-'));
  git(root, 'init', '-q');
  writeFileSync(join(root, 'README.md'), 'scratch\n');
  git(root, 'add', 'README.md');
  git(root, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'init');
  mkdirSync(join(root, 'build/content'), { recursive: true });
  mkdirSync(join(root, 'build/paid-content/python'), { recursive: true });
  writeFileSync(join(root, 'build/content/manifest.json'), '{}\n');
  writeFileSync(join(root, 'build/paid-content/python/medium.json'), '{}\n');
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('deployToRailway.sh upload guard', () => {
  it('passes a clean staged context in a dry run and contacts nothing', () => {
    const result = runDeploy(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('passed every check');
  });

  it.each([
    'build/paid-content/deploy_key',
    'build/paid-content/id_ed25519',
    'build/content/.env.production',
    'build/content/server.pem',
    'build/content/signing.key',
    'build/paid-content/.ssh/config',
    'build/paid-content/known_hosts',
    'build/paid-content/.git/HEAD',
  ])('refuses to upload when %s is staged', (planted) => {
    const path = join(root, planted);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, 'planted\n');

    const result = runDeploy(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to upload');
    expect(result.stdout).not.toContain('passed every check');
  });

  it('refuses when build/ was never staged', () => {
    rmSync(join(root, 'build'), { force: true, recursive: true });
    const result = runDeploy(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('build/ is not staged');
  });

  it('refuses a real deploy without a Railway token', () => {
    const result = spawnSync('bash', [script, 'staging', '0.0.0'], {
      env: cleanEnv({ DEPLOY_ROOT: root }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RAILWAY_TOKEN is not set');
  });

  it('refuses an unknown environment', () => {
    const result = spawnSync('bash', [script, 'preview', '0.0.0'], {
      env: cleanEnv({ DEPLOY_DRY_RUN: '1', DEPLOY_ROOT: root }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown environment');
  });
});
