// B-60: no paid bank is ever public. The repository's content/ tree and the bundled bank module
// hold no paid bank, the web build fails when its export holds one, and the export check finds a
// paid bank by its manifest path or by its bytes (a copy at any other path).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { findPaidBankFiles } from '../assertNoPaidBanks.mjs';

const REPO_DIR = join(__dirname, '..', '..');
const MANIFEST_PATH = join(REPO_DIR, 'content', 'manifest.json');

type BankEntry = { access: 'free' | 'paid'; hash: string; path: string };
type ManifestDocument = { languages: { banks: Record<string, BankEntry>; id: string }[] };

async function readRepoManifest(): Promise<ManifestDocument> {
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as ManifestDocument;
}

function listPaid(manifest: ManifestDocument): { key: string; path: string }[] {
  return manifest.languages.flatMap(({ banks, id }) =>
    Object.entries(banks)
      .filter(([, bank]) => bank.access === 'paid')
      .map(([difficulty, bank]) => ({ key: `${id}/${difficulty}`, path: bank.path })),
  );
}

async function writeFileUnder(root: string, relativePath: string, body: string): Promise<void> {
  await mkdir(dirname(join(root, relativePath)), { recursive: true });
  await writeFile(join(root, relativePath), body);
}

describe('the public content tree', () => {
  it('lists paid banks in the manifest but holds no paid bank file', async () => {
    const manifest = await readRepoManifest();
    expect(listPaid(manifest).length).toBeGreaterThan(0);

    expect(await findPaidBankFiles(join(REPO_DIR, 'content'), manifest)).toEqual([]);
  });

  it('bundles no paid bank into the app', async () => {
    const manifest = await readRepoManifest();
    const generated = await readFile(join(REPO_DIR, 'services/content/bundledBanks.generated.ts'), 'utf8');

    for (const { key, path } of listPaid(manifest)) {
      expect(generated).not.toContain(`'${key}'`);
      expect(generated).not.toContain(path);
    }
  });

  it('runs the paid bank check over the web export as the last build step', () => {
    const { scripts } = JSON.parse(readFileSync(join(REPO_DIR, 'package.json'), 'utf8'));

    expect(scripts.build).toMatch(/&& node scripts\/assertNoPaidBanks\.mjs dist$/);
  });
});

describe('findPaidBankFiles', () => {
  const PAID_BODY = '{"schemaVersion":2,"questions":["paid"]}\n';
  const FREE_BODY = '{"schemaVersion":2,"questions":["free"]}\n';
  const manifest: ManifestDocument = {
    languages: [
      {
        banks: {
          easy: {
            access: 'free',
            hash: createHash('sha256').update(FREE_BODY).digest('hex'),
            path: 'python/easy.json',
          },
          medium: {
            access: 'paid',
            hash: createHash('sha256').update(PAID_BODY).digest('hex'),
            path: 'python/medium.json',
          },
        },
        id: 'python',
      },
    ],
  };
  let exportDir: string;

  beforeEach(async () => {
    exportDir = await mkdtemp(join(tmpdir(), 'web-export-'));
    await writeFileUnder(exportDir, 'index.html', '<div id="root"></div>');
    await writeFileUnder(exportDir, 'content/manifest.json', '{}');
    await writeFileUnder(exportDir, 'content/python/easy.json', FREE_BODY);
  });

  afterEach(async () => {
    await rm(exportDir, { force: true, recursive: true });
  });

  it('finds nothing in an export that holds only free banks', async () => {
    expect(await findPaidBankFiles(exportDir, manifest)).toEqual([]);
  });

  it('finds a file at a paid bank path, whatever its bytes', async () => {
    await writeFileUnder(exportDir, 'content/python/medium.json', '{"replaced":true}');

    expect(await findPaidBankFiles(exportDir, manifest)).toEqual(['content/python/medium.json']);
  });

  it('finds a paid bank copied to another path by its bytes', async () => {
    await writeFileUnder(exportDir, '_expo/static/js/web/bank-1234.json', PAID_BODY);

    expect(await findPaidBankFiles(exportDir, manifest)).toEqual(['_expo/static/js/web/bank-1234.json']);
  });
});

// The build step must never pass silently: run from a path that needs URL encoding, the script
// still recognizes itself as the entry point and fails on a paid bank.
describe('assertNoPaidBanks.mjs run as a script', () => {
  it('fails the build from a path with a space in it', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'paid check '));
    try {
      const source = await readFile(join(REPO_DIR, 'scripts/assertNoPaidBanks.mjs'), 'utf8');
      await writeFileUnder(workDir, 'scripts dir/assertNoPaidBanks.mjs', source);
      const paidEntry = { access: 'paid', hash: 'f'.repeat(64), path: 'python/medium.json' };
      const manifest = { languages: [{ banks: { medium: paidEntry }, id: 'python' }] };
      await writeFileUnder(workDir, 'content/manifest.json', JSON.stringify(manifest));
      await writeFileUnder(workDir, 'dist/content/python/medium.json', '{}');

      const run = spawnSync(process.execPath, [join(workDir, 'scripts dir', 'assertNoPaidBanks.mjs'), 'dist'], {
        cwd: workDir,
        encoding: 'utf8',
      });

      expect(run.status).toBe(1);
      expect(run.stderr).toContain('paid bank in the web export: content/python/medium.json');
    } finally {
      await rm(workDir, { force: true, recursive: true });
    }
  });
});
