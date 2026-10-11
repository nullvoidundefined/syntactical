// A bank file that is not a valid bank fails the build with the named `<path> is invalid`
// error, whether or not an approved taxonomy exists for its language.
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');
const TAXONOMY = [{ description: 'Believes default arguments are rebuilt on each call.', id: 'python.entry-a' }];
const BANK_PATH = 'python/easy.json';

describe('buildContentManifest malformed bank', () => {
  let workDir: string;
  let contentDir: string;
  let taxonomyDir: string;
  let outputs: { banksPath: string; manifestPath: string };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'content-malformed-'));
    contentDir = join(workDir, 'content');
    taxonomyDir = join(workDir, 'taxonomy');
    outputs = { banksPath: join(workDir, 'banks.ts'), manifestPath: join(workDir, 'manifest.ts') };
    await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
    await mkdir(taxonomyDir);
    await writeFile(join(contentDir, BANK_PATH), '{"schemaVersion":2}');
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  it('names the bank when an approved taxonomy exists for its language', async () => {
    await writeFile(join(taxonomyDir, 'python.json'), JSON.stringify(TAXONOMY));

    await expect(buildContentManifest(contentDir, outputs, taxonomyDir)).rejects.toThrow(
      new RegExp(`${BANK_PATH} is invalid`),
    );
  });

  it('names the bank when no taxonomy file exists for its language', async () => {
    await expect(buildContentManifest(contentDir, outputs, taxonomyDir)).rejects.toThrow(
      new RegExp(`${BANK_PATH} is invalid`),
    );
  });

  it('names the bank when no taxonomy directory is given', async () => {
    await expect(buildContentManifest(contentDir, outputs)).rejects.toThrow(new RegExp(`${BANK_PATH} is invalid`));
  });
});
