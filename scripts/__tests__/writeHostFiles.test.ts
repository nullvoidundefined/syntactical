// scripts/__tests__/writeHostFiles.test.ts
// The host files the web build writes beside the static export, which Cloudflare Pages reads: _headers (security
// headers on every path, a year's cache for Expo's hashed bundles and for the bank files under content/, revalidation
// on every request for content/manifest.json, content/sponsor.json, and the sponsor icons) and 404.html, a copy of
// the exported not-found page. It writes no .nojekyll and copies no page, because the static export already holds
// one page per route.
import { execFileSync } from 'node:child_process';
import { symlinkSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeHostFiles } from '../writeHostFiles.mjs';

const INDEX_HTML = '<div id="root"></div>';
const NOT_FOUND_HTML = '<h1>Not found</h1>';
const YEAR = '  Cache-Control: public, max-age=31536000, immutable';
const EXPECTED_HEADERS = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  "  Content-Security-Policy: frame-ancestors 'none'",
  '',
  '/_expo/static/*',
  YEAR,
  '',
  '/content/manifest.json',
  '  Cache-Control: no-cache',
  '',
  '/content/sponsor.json',
  '  Cache-Control: no-cache',
  '',
  '/content/sponsor/*',
  '  Cache-Control: no-cache',
  '',
  '/content/:track/easy.json',
  YEAR,
  '',
  '/content/:track/medium.json',
  YEAR,
  '',
  '/content/:track/hard.json',
  YEAR,
  '',
].join('\n');

async function makeExport(): Promise<string> {
  const outputDir = await mkdtemp(join(tmpdir(), 'host-'));
  await writeFile(join(outputDir, 'index.html'), INDEX_HTML);
  await writeFile(join(outputDir, '+not-found.html'), NOT_FOUND_HTML);
  return outputDir;
}

describe('writeHostFiles', () => {
  it('writes _headers with security headers and non-overlapping cache rules', async () => {
    const outputDir = await makeExport();
    await writeHostFiles(outputDir);
    expect(await readFile(join(outputDir, '_headers'), 'utf8')).toBe(EXPECTED_HEADERS);
  });

  it('copies the exported not-found page to 404.html', async () => {
    const outputDir = await makeExport();
    await writeHostFiles(outputDir);
    expect(await readFile(join(outputDir, '404.html'), 'utf8')).toBe(NOT_FOUND_HTML);
  });

  it('writes no .nojekyll and no per-route copies of index.html', async () => {
    const outputDir = await makeExport();
    await writeHostFiles(outputDir);
    expect((await readdir(outputDir)).sort()).toEqual(['+not-found.html', '404.html', '_headers', 'index.html']);
  });

  it('rejects an export with no not-found page, naming the missing file', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'host-'));
    await writeFile(join(outputDir, 'index.html'), INDEX_HTML);
    await expect(writeHostFiles(outputDir)).rejects.toThrow('+not-found.html');
  });

  it('writes the files when run as a script from a path with a space', async () => {
    const outputDir = await makeExport();
    const scriptDir = await mkdtemp(join(tmpdir(), 'script dir-'));
    const script = join(scriptDir, 'writeHostFiles.mjs');
    await copyFile(join(__dirname, '..', 'writeHostFiles.mjs'), script);
    execFileSync('node', [script, outputDir]);
    expect(await readFile(join(outputDir, '404.html'), 'utf8')).toBe(NOT_FOUND_HTML);
    expect(await readFile(join(outputDir, '_headers'), 'utf8')).toBe(EXPECTED_HEADERS);
  });

  it('writes the files when run as a script through a symlink to it', async () => {
    const outputDir = await makeExport();
    const linkDir = await mkdtemp(join(tmpdir(), 'link-'));
    const link = join(linkDir, 'writeHostFiles.mjs');
    symlinkSync(join(__dirname, '..', 'writeHostFiles.mjs'), link);
    execFileSync('node', [link, outputDir]);
    expect(await readFile(join(outputDir, '404.html'), 'utf8')).toBe(NOT_FOUND_HTML);
  });

  it('exits non-zero as a script when the export has no not-found page', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'host-'));
    expect(() =>
      execFileSync('node', [join(__dirname, '..', 'writeHostFiles.mjs'), outputDir], { stdio: 'pipe' }),
    ).toThrow('+not-found.html');
  });
});
