// Builds the content the e2e run serves: one public directory holding the repository's manifest and
// every bank it lists, Easy, Medium, and Hard, copied unchanged, so the web bundle's bundled Easy
// banks and the served manifest's hashes match. The API reads it and the web host serves it.
import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface Manifest {
  languages: Array<{ banks: Record<string, { path: string }> }>;
}

async function copyUnder(contentSource: string, publicDir: string, path: string): Promise<void> {
  await mkdir(dirname(join(publicDir, path)), { recursive: true });
  await cp(join(contentSource, path), join(publicDir, path));
}

async function writeFixtureContent(options: { contentSource: string; publicDir: string }): Promise<void> {
  const { contentSource, publicDir } = options;
  const manifest = JSON.parse(await readFile(join(contentSource, 'manifest.json'), 'utf8')) as Manifest;
  for (const language of manifest.languages) {
    for (const { path } of Object.values(language.banks)) await copyUnder(contentSource, publicDir, path);
  }
  await copyUnder(contentSource, publicDir, 'manifest.json');
}

export { writeFixtureContent };
