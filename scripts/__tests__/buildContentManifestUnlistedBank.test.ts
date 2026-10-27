// scripts/__tests__/buildContentManifestUnlistedBank.test.ts
// The web build copies content/ whole, so a bank file the manifest does not list would ship unhashed and
// unvalidated. The content build fails naming every .json file under a track directory that is not a manifest
// bank path, before it writes anything. Files at the top of content/ and non-JSON files are not banks.
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildContentManifest } from '../buildContentManifest.mjs';

import { copyOneTrack } from './copyOneTrack';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');

describe('buildContentManifest unlisted bank files', () => {
  let workDir: string;
  let contentDir: string;
  let outputs: { banksPath: string; manifestPath: string };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'content-unlisted-'));
    contentDir = join(workDir, 'content');
    outputs = { banksPath: join(workDir, 'banks.ts'), manifestPath: join(workDir, 'manifest.ts') };
    // The python track alone: go and kotlin below are tracks this manifest does not list.
    await copyOneTrack(REPOSITORY_CONTENT_DIR, contentDir, 'python');
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  async function plantBank(bankPath: string): Promise<void> {
    await mkdir(dirname(join(contentDir, bankPath)), { recursive: true });
    await cp(join(contentDir, 'python', 'easy.json'), join(contentDir, bankPath));
  }

  it.each([
    ['a difficulty its track does not list', 'python/expert.json'],
    ['a track the manifest does not list', 'kotlin/easy.json'],
    ['a file nested below a track directory', 'python/old/easy.json'],
  ])('fails naming %s', async (_description, bankPath) => {
    await plantBank(bankPath);

    await expect(buildContentManifest(contentDir, outputs)).rejects.toThrow(
      `bank file not in the manifest: ${bankPath}`,
    );
  });

  it('names every unlisted file, sorted, in one error, and writes nothing', async () => {
    await plantBank('python/expert.json');
    await plantBank('go/legacy.json');
    const manifestBefore = await readFile(join(contentDir, 'manifest.json'), 'utf8');

    await expect(buildContentManifest(contentDir, outputs)).rejects.toThrow(
      'bank file not in the manifest: go/legacy.json, python/expert.json',
    );

    expect(await readFile(join(contentDir, 'manifest.json'), 'utf8')).toBe(manifestBefore);
    await expect(stat(outputs.banksPath)).rejects.toThrow();
  });

  it('ignores JSON files at the top of content/ and non-JSON files under a track', async () => {
    await writeFile(join(contentDir, 'sponsor.json'), '{}\n');
    await writeFile(join(contentDir, 'python', '.DS_Store'), '');

    await expect(buildContentManifest(contentDir, outputs)).resolves.toBeUndefined();
  });
});
