// B-60: the content build with paid banks split out of the public tree. Without a private content
// root it never reads a paid bank and keeps each paid entry's hash, topic counts, and version from
// the manifest; it never bundles a paid bank; and it fails on a paid bank under content/ or a free
// bank under the private content root.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');

type BankEntry = { access: 'free' | 'paid'; contentVersion: number; hash: string; path: string };
type ManifestDocument = { languages: { banks: Record<string, BankEntry>; id: string }[] };

async function readManifest(contentDir: string): Promise<ManifestDocument> {
  return JSON.parse(await readFile(join(contentDir, 'manifest.json'), 'utf8')) as ManifestDocument;
}

function listBanks(manifest: ManifestDocument, access: 'free' | 'paid'): { key: string; path: string }[] {
  return manifest.languages.flatMap(({ banks, id }) =>
    Object.entries(banks)
      .filter(([, bank]) => bank.access === access)
      .map(([difficulty, bank]) => ({ key: `${id}/${difficulty}`, path: bank.path })),
  );
}

// A paid bank stand-in for the private root: the same language's free bank bytes. The real paid
// banks live in the private syntactical-content repo, never in this one.
async function writeStandInPaidBanks(contentDir: string, contentRoot: string): Promise<void> {
  for (const { path } of listBanks(await readManifest(contentDir), 'paid')) {
    const language = path.split('/')[0];
    await mkdir(join(contentRoot, language), { recursive: true });
    await writeFile(join(contentRoot, path), await readFile(join(contentDir, language, 'easy.json')));
  }
}

describe('buildContentManifest with paid banks outside the public tree', () => {
  let workDir: string;
  let contentDir: string;
  let outputs: { banksPath: string; manifestPath: string };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'content-split-'));
    contentDir = join(workDir, 'content');
    outputs = { banksPath: join(workDir, 'banks.ts'), manifestPath: join(workDir, 'manifest.ts') };
    await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
    for (const { path } of listBanks(await readManifest(contentDir), 'paid')) {
      await rm(join(contentDir, path), { force: true });
    }
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  it('keeps every paid entry unchanged and bundles only free banks when no content root is given', async () => {
    const before = await readManifest(contentDir);

    await buildContentManifest(contentDir, outputs);

    const after = await readManifest(contentDir);
    for (const [index, language] of before.languages.entries()) {
      for (const [difficulty, bank] of Object.entries(language.banks)) {
        if (bank.access === 'paid') expect(after.languages[index].banks[difficulty]).toEqual(bank);
      }
    }
    const bundle = await readFile(outputs.banksPath, 'utf8');
    const bundledKeys = [...bundle.matchAll(/^ {2}'([^']+)': require/gm)].map(([, key]) => key);
    expect(bundledKeys.sort()).toEqual(
      listBanks(before, 'free')
        .map(({ key }) => key)
        .sort(),
    );
  });

  it('fails naming the bank when a paid bank file is under content/, with or without a content root', async () => {
    const contentRoot = join(workDir, 'private');
    await writeStandInPaidBanks(contentDir, contentRoot);
    await cp(join(contentDir, 'python', 'easy.json'), join(contentDir, 'python', 'medium.json'));

    await expect(buildContentManifest(contentDir, outputs)).rejects.toThrow(
      'paid bank in public content: python/medium',
    );
    await expect(buildContentManifest(contentDir, outputs, undefined, undefined, contentRoot)).rejects.toThrow(
      'paid bank in public content: python/medium',
    );
  });

  it('fails naming the bank when a free bank file is under the private content root', async () => {
    const contentRoot = join(workDir, 'private');
    await writeStandInPaidBanks(contentDir, contentRoot);
    await cp(join(contentDir, 'python', 'easy.json'), join(contentRoot, 'python', 'easy.json'));

    await expect(buildContentManifest(contentDir, outputs, undefined, undefined, contentRoot)).rejects.toThrow(
      'free bank in private content: python/easy',
    );
  });
});
