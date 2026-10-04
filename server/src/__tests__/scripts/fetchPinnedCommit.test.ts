// fetchPinnedCommit.sh is the exact-commit step of the paid-content staging: the checked-out tree
// must be the pinned commit, never the moving head, and a bad or unknown sha must fail.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const fetchScript = fileURLToPath(new URL('../../../scripts/fetchPinnedCommit.sh', import.meta.url));

let work: string;
let bareUrl: string;
let pinnedSha: string;

// A child env without GIT_* so a hook's GIT_DIR never reaches the temp repos.
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) {
      env[key] = value;
    }
  }
  return env;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', env: cleanEnv() },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function runFetch(sha: string, dir: string) {
  return spawnSync('bash', [fetchScript, bareUrl, sha, dir], { encoding: 'utf8', env: cleanEnv() });
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'fetch-pinned-test-'));
  const src = join(work, 'src');
  git(work, 'init', '--quiet', '--initial-branch=main', src);
  writeFileSync(join(src, 'bank.json'), 'pinned');
  git(src, 'add', '.');
  git(src, 'commit', '--quiet', '-m', 'pinned');
  pinnedSha = git(src, 'rev-parse', 'HEAD');
  writeFileSync(join(src, 'bank.json'), 'main moved ahead');
  writeFileSync(join(src, 'later.json'), 'only on main');
  git(src, 'add', '.');
  git(src, 'commit', '--quiet', '-m', 'main ahead');
  const bare = join(work, 'private.git');
  git(work, 'clone', '--quiet', '--bare', src, bare);
  git(bare, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  bareUrl = `file://${bare}`;
});
afterEach(() => {
  rmSync(work, { force: true, recursive: true });
});

describe('fetchPinnedCommit.sh', () => {
  it('checks out the pinned commit, not the head of main that is ahead of it', () => {
    const dir = join(work, 'out');

    const result = runFetch(pinnedSha, dir);

    expect(result.status).toBe(0);
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(pinnedSha);
    expect(readFileSync(join(dir, 'bank.json'), 'utf8')).toBe('pinned');
    expect(existsSync(join(dir, 'later.json'))).toBe(false);
  });

  it('fails when the sha is not in the repository', () => {
    const dir = join(work, 'out');

    const result = runFetch('0'.repeat(40), dir);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(dir, 'bank.json'))).toBe(false);
  });

  it.each([['abc123'], ['A'.repeat(40)], ['main'], ['--upload-pack=touch-pwned'], ['a'.repeat(41)]])(
    'fails before any git call when the sha is %s',
    (sha) => {
      const dir = join(work, 'out');

      const result = runFetch(sha, dir);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('40 lowercase hex');
      expect(existsSync(dir)).toBe(false);
    },
  );
});
