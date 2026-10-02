import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
});
