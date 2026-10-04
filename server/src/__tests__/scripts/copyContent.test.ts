// copyContent.mjs gates what the API image ships: a bank must match its manifest hash, a manifest
// path must stay inside the source, and nothing the manifest does not name is copied.
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

function writeManifest(entries: Record<string, { access: string; hash: string; path: string }>): string {
  const manifestPath = join(work, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ languages: [{ banks: entries }] }));
  return manifestPath;
}

function runCopy(manifestPath: string, access: 'free' | 'paid') {
  return spawnSync('node', [copyScript, manifestPath, join(work, 'from'), join(work, 'to'), access], {
    encoding: 'utf8',
  });
}

function writeSource(path: string, text: string): void {
  const file = join(work, 'from', path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
}

describe('copyContent.mjs', () => {
  it('copies a bank whose bytes match the manifest hash', () => {
    writeSource('python/easy.json', '{"ok":1}');
    const manifest = writeManifest({
      easy: { access: 'paid', hash: sha256('{"ok":1}'), path: 'python/easy.json' },
    });

    const result = runCopy(manifest, 'paid');

    expect(result.status).toBe(0);
    expect(existsSync(join(work, 'to', 'python', 'easy.json'))).toBe(true);
  });

  it('fails with a hash mismatch when the bytes were tampered with', () => {
    writeSource('python/easy.json', '{"ok":2}');
    const manifest = writeManifest({
      easy: { access: 'paid', hash: sha256('{"ok":1}'), path: 'python/easy.json' },
    });

    const result = runCopy(manifest, 'paid');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('hash mismatch');
    expect(existsSync(join(work, 'to', 'python', 'easy.json'))).toBe(false);
  });

  it.each(['../escape.json', '/etc/passwd', 'a/../../escape.json', 'a\\b.json'])(
    'rejects the manifest path %s',
    (path) => {
      writeSource('python/easy.json', 'x');
      const manifest = writeManifest({ easy: { access: 'paid', hash: sha256('x'), path } });

      const result = runCopy(manifest, 'paid');

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unsafe bank path');
    },
  );

  it('does not copy a file the manifest does not name', () => {
    writeSource('python/easy.json', 'x');
    writeSource('python/extra.json', 'not in the manifest');
    writeSource('.git/config', 'git internals');
    const manifest = writeManifest({ easy: { access: 'paid', hash: sha256('x'), path: 'python/easy.json' } });

    const result = runCopy(manifest, 'paid');

    expect(result.status).toBe(0);
    expect(readdirSync(join(work, 'to', 'python'))).toEqual(['easy.json']);
    expect(existsSync(join(work, 'to', '.git'))).toBe(false);
  });
});

describe('stageBuildContent.sh fixture', () => {
  it('stages only the manifest-named files under build/', () => {
    // A temp copy of the scripts and the fixture, so the real build/ is never touched.
    mkdirSync(join(work, 'server', 'scripts'), { recursive: true });
    cpSync(copyScript, join(work, 'server', 'scripts', 'copyContent.mjs'));
    cpSync(stageScript, join(work, 'server', 'scripts', 'stageBuildContent.sh'));
    cpSync(fixtureDir, join(work, 'server', 'ci-fixture'), { recursive: true });
    writeFileSync(join(work, 'server', 'ci-fixture', 'paid', 'python', 'stray.json'), 'not in the manifest');
    writeFileSync(join(work, 'server', 'ci-fixture', 'public', 'notes.txt'), 'not in the manifest');

    execFileSync('bash', [join(work, 'server', 'scripts', 'stageBuildContent.sh'), 'fixture'], { stdio: 'pipe' });

    const staged = (dir: string): string[] =>
      readdirSync(join(work, 'build', dir), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name).slice(join(work, 'build', dir).length))
        .sort();
    expect(staged('content')).toEqual(['/manifest.json', '/python/easy.json']);
    expect(staged('paid-content')).toEqual(['/python/medium.json']);
  });
});
