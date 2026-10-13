import { execFileSync } from 'node:child_process';
import { symlinkSync } from 'node:fs';
import { access, copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copySpaFallback } from '../copySpaFallback.mjs';

describe('copySpaFallback', () => {
  it('copies index.html to 404.html and writes .nojekyll', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'spa-'));
    await writeFile(join(outputDir, 'index.html'), '<div id="root"></div>');
    await copySpaFallback(outputDir);
    expect(await readFile(join(outputDir, '404.html'), 'utf8')).toBe('<div id="root"></div>');
    await expect(access(join(outputDir, '.nojekyll'))).resolves.toBeUndefined();
  });

  it('copies when run as a script from a path with a space', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'spa-'));
    await writeFile(join(outputDir, 'index.html'), '<div id="root"></div>');
    const scriptDir = await mkdtemp(join(tmpdir(), 'script dir-'));
    const script = join(scriptDir, 'copySpaFallback.mjs');
    await copyFile(join(__dirname, '..', 'copySpaFallback.mjs'), script);
    execFileSync('node', [script, outputDir]);
    expect(await readFile(join(outputDir, '404.html'), 'utf8')).toBe('<div id="root"></div>');
  });

  it('copies when run as a script through a symlink to it', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'spa-'));
    await writeFile(join(outputDir, 'index.html'), '<div id="root"></div>');
    const linkDir = await mkdtemp(join(tmpdir(), 'link-'));
    const link = join(linkDir, 'copySpaFallback.mjs');
    symlinkSync(join(__dirname, '..', 'copySpaFallback.mjs'), link);
    execFileSync('node', [link, outputDir]);
    expect(await readFile(join(outputDir, '404.html'), 'utf8')).toBe('<div id="root"></div>');
  });
});
