import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRouteEntries } from '../writeRouteEntries.mjs';

const INDEX_HTML = '<div id="root"></div>';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'routes-'));
  const outputDir = join(root, 'dist');
  const appDir = join(root, 'app');
  await mkdir(outputDir);
  await mkdir(join(appDir, '[language]', '[difficulty]'), { recursive: true });
  await mkdir(join(appDir, '__tests__'));
  await writeFile(join(outputDir, 'index.html'), INDEX_HTML);
  for (const file of [
    'index.tsx',
    '_layout.tsx',
    '+not-found.tsx',
    'sign-in.tsx',
    'settings.tsx',
    '[language]/index.tsx',
    '[language]/[difficulty]/index.tsx',
    '[language]/[difficulty]/play.tsx',
    '[language]/[difficulty]/length.tsx',
    '__tests__/signIn.test.tsx',
  ]) {
    await writeFile(join(appDir, file), '');
  }
  const manifestPath = join(root, 'manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      languages: [{ id: 'python', banks: { easy: {}, medium: {} } }],
    }),
  );
  return { outputDir, appDir, manifestPath };
}

describe('writeRouteEntries', () => {
  it('writes an index.html copy for static and manifest-expanded routes', async () => {
    const { outputDir, appDir, manifestPath } = await makeFixture();
    await writeRouteEntries(outputDir, { appDir, manifestPath });
    for (const route of [
      'sign-in',
      'settings',
      'python',
      'python/easy',
      'python/easy/play',
      'python/easy/length',
      'python/medium/play',
    ]) {
      expect(await readFile(join(outputDir, route, 'index.html'), 'utf8')).toBe(INDEX_HTML);
    }
  });

  it('writes nothing for unknown paths, layouts, not-found, tests, or dynamic segments', async () => {
    const { outputDir, appDir, manifestPath } = await makeFixture();
    await writeRouteEntries(outputDir, { appDir, manifestPath });
    expect((await readdir(outputDir)).sort()).toEqual(['index.html', 'python', 'settings', 'sign-in']);
    expect(await exists(join(outputDir, 'python', 'hard'))).toBe(false);
    expect(await exists(join(outputDir, 'ruby'))).toBe(false);
  });
});
