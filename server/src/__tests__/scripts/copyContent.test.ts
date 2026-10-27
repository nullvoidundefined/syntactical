// copyContent.mjs gates what the API image ships: every bank the manifest lists must match its
// hash, a manifest path must stay inside the source, nothing the manifest does not name is copied,
// and the manifest itself is copied. stageBuildContent.sh stages build/content alone, from this
// repository's content or the CI fixture, and refuses the retired private mode.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const serverDir = fileURLToPath(new URL('../../../', import.meta.url));
const copyScript = join(serverDir, 'scripts', 'copyContent.mjs');
const stageScript = join(serverDir, 'scripts', 'stageBuildContent.sh');
const fixtureDir = join(serverDir, 'ci-fixture');

let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'copy-content-test-'));
});
afterEach(() => {
  rmSync(work, { force: true, recursive: true });
});

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function writeManifest(entries: Record<string, { hash: string; path: string }>): string {
  const manifestPath = join(work, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ languages: [{ banks: entries }] }));
  return manifestPath;
}

function runCopy(manifestPath: string) {
  return spawnSync('node', [copyScript, manifestPath, join(work, 'from'), join(work, 'to')], { encoding: 'utf8' });
}

function writeSource(path: string, text: string): void {
  const file = join(work, 'from', path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length))
    .sort();
}

function copyStageInputs(): void {
  mkdirSync(join(work, 'server', 'scripts'), { recursive: true });
  cpSync(copyScript, join(work, 'server', 'scripts', 'copyContent.mjs'));
  cpSync(stageScript, join(work, 'server', 'scripts', 'stageBuildContent.sh'));
}

describe('copyContent.mjs', () => {
  it('copies every bank the manifest lists, Easy, Medium, and Hard, and the manifest', () => {
    writeSource('python/easy.json', '{"e":1}');
    writeSource('python/medium.json', '{"m":1}');
    writeSource('python/hard.json', '{"h":1}');
    const manifest = writeManifest({
      easy: { hash: sha256('{"e":1}'), path: 'python/easy.json' },
      hard: { hash: sha256('{"h":1}'), path: 'python/hard.json' },
      medium: { hash: sha256('{"m":1}'), path: 'python/medium.json' },
    });

    const result = runCopy(manifest);

    expect(result.status).toBe(0);
    expect(listFiles(join(work, 'to'))).toEqual([
      '/manifest.json',
      '/python/easy.json',
      '/python/hard.json',
      '/python/medium.json',
    ]);
  });

  it('fails naming a bank the manifest lists but the source lacks', () => {
    writeSource('python/easy.json', 'x');
    const manifest = writeManifest({
      easy: { hash: sha256('x'), path: 'python/easy.json' },
      medium: { hash: sha256('y'), path: 'python/medium.json' },
    });

    const result = runCopy(manifest);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('bank missing: python/medium.json');
  });

  it('fails with a hash mismatch when the bytes were tampered with', () => {
    writeSource('python/easy.json', '{"ok":2}');
    const manifest = writeManifest({ easy: { hash: sha256('{"ok":1}'), path: 'python/easy.json' } });

    const result = runCopy(manifest);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('hash mismatch');
    expect(existsSync(join(work, 'to', 'python', 'easy.json'))).toBe(false);
  });

  it.each(['../escape.json', '/etc/passwd', 'a/../../escape.json', 'a\\b.json'])(
    'rejects the manifest path %s',
    (path) => {
      writeSource('python/easy.json', 'x');
      const manifest = writeManifest({ easy: { hash: sha256('x'), path } });

      const result = runCopy(manifest);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unsafe bank path');
    },
  );

  it('does not copy a file the manifest does not name', () => {
    writeSource('python/easy.json', 'x');
    writeSource('python/extra.json', 'not in the manifest');
    writeSource('.git/config', 'git internals');
    const manifest = writeManifest({ easy: { hash: sha256('x'), path: 'python/easy.json' } });

    const result = runCopy(manifest);

    expect(result.status).toBe(0);
    expect(readdirSync(join(work, 'to', 'python'))).toEqual(['easy.json']);
    expect(existsSync(join(work, 'to', '.git'))).toBe(false);
  });
});

describe('stageBuildContent.sh', () => {
  it('fixture: stages only the manifest-named files under build/content, and no paid-content', () => {
    // A temp copy of the scripts and the fixture, so the real build/ is never touched.
    copyStageInputs();
    cpSync(fixtureDir, join(work, 'server', 'ci-fixture'), { recursive: true });
    writeFileSync(join(work, 'server', 'ci-fixture', 'public', 'python', 'stray.json'), 'not in the manifest');
    writeFileSync(join(work, 'server', 'ci-fixture', 'public', 'notes.txt'), 'not in the manifest');

    execFileSync('bash', [join(work, 'server', 'scripts', 'stageBuildContent.sh'), 'fixture'], { stdio: 'pipe' });

    expect(listFiles(join(work, 'build', 'content'))).toEqual([
      '/manifest.json',
      '/python/easy.json',
      '/python/medium.json',
    ]);
    expect(existsSync(join(work, 'build', 'paid-content'))).toBe(false);
  });

  it("public: stages this repository's content/ under build/content", () => {
    copyStageInputs();
    cpSync(join(fixtureDir, 'public'), join(work, 'content'), { recursive: true });

    execFileSync('bash', [join(work, 'server', 'scripts', 'stageBuildContent.sh'), 'public'], { stdio: 'pipe' });

    expect(listFiles(join(work, 'build', 'content'))).toEqual([
      '/manifest.json',
      '/python/easy.json',
      '/python/medium.json',
    ]);
  });

  it('refuses the retired private mode before touching anything', () => {
    copyStageInputs();

    const result = spawnSync('bash', [join(work, 'server', 'scripts', 'stageBuildContent.sh'), 'private'], {
      encoding: 'utf8',
      env: { ...process.env, CONTENT_DEPLOY_KEY: 'placeholder' },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown mode 'private'");
  });
});
