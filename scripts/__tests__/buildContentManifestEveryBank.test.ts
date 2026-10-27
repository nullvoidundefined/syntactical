// scripts/__tests__/buildContentManifestEveryBank.test.ts
// Every bank lives under content/: the build hashes Medium and Hard banks from there with no second root, ships the
// misconceptions that cards in any bank link (and drops the rest), and bundles only BUNDLED_DIFFICULTIES, which is
// Easy alone. Medium and Hard reach the app as downloads.
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BUNDLED_DIFFICULTIES, buildContentManifest } from '../buildContentManifest.mjs';

import { stripMisconceptionLinks } from './stripMisconceptionLinks';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');
const STALE_HASH = 'a'.repeat(64);
const ENTRY_A = { description: 'Believes default arguments are rebuilt on each call.', id: 'python.entry-a' };
const ENTRY_B = { description: 'Believes a list copy is always deep.', id: 'python.entry-b' };

type BankEntry = { contentVersion: number; hash: string; path: string };
type Language = { banks: Record<string, BankEntry>; id: string; misconceptions: { description: string; id: string }[] };
type Manifest = { languages: Language[] };
type Choice = { misconceptionId?: string; rationale?: string };
type Question = { answerIndex?: number; choices?: Choice[]; type: string };

describe('buildContentManifest with every bank under content/', () => {
  let workDir: string;
  let contentDir: string;
  let taxonomyDir: string;
  let outputs: { banksPath: string; manifestPath: string };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'content-every-bank-'));
    contentDir = join(workDir, 'content');
    taxonomyDir = join(workDir, 'taxonomy');
    outputs = { banksPath: join(workDir, 'banks.ts'), manifestPath: join(workDir, 'manifest.ts') };
    await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
    await mkdir(taxonomyDir);
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  async function readManifest(): Promise<Manifest> {
    return JSON.parse(await readFile(join(contentDir, 'manifest.json'), 'utf8')) as Manifest;
  }

  async function writeManifest(manifest: Manifest): Promise<void> {
    await writeFile(join(contentDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  function findPython(manifest: Manifest): Language {
    return manifest.languages.find(({ id }) => id === 'python') as Language;
  }

  async function hashOf(bankPath: string): Promise<string> {
    return createHash('sha256')
      .update(await readFile(join(contentDir, bankPath)))
      .digest('hex');
  }

  // Makes the first wrong choice of the bank's first multiple-choice question carry `misconceptionId`.
  async function linkFirstCard(bankPath: string, misconceptionId: string): Promise<void> {
    const file = join(contentDir, bankPath);
    const bank = JSON.parse(await readFile(file, 'utf8')) as { questions: Question[] };
    const question = bank.questions.find(({ type }) => type === 'mc') as Question;
    const choice = (question.choices as Choice[])[question.answerIndex === 0 ? 1 : 0];
    choice.misconceptionId = misconceptionId;
    choice.rationale = 'This is the mistaken reading, and the real behavior differs for a stated reason.';
    await writeFile(file, `${JSON.stringify(bank, null, 2)}\n`);
  }

  it('bundles Easy and nothing else', () => {
    expect(BUNDLED_DIFFICULTIES).toEqual(['easy']);
  });

  it('hashes every bank from content/ and bumps the version of only the bank whose recorded hash was stale', async () => {
    const manifest = await readManifest();
    const before = structuredClone(findPython(manifest).banks);
    findPython(manifest).banks.medium.hash = STALE_HASH;
    await writeManifest(manifest);

    await buildContentManifest(contentDir, outputs);

    const after = await readManifest();
    for (const language of after.languages) {
      for (const bank of Object.values(language.banks)) {
        expect(bank.hash).toBe(await hashOf(bank.path));
      }
    }
    expect(findPython(after).banks.medium.contentVersion).toBe(before.medium.contentVersion + 1);
    expect(findPython(after).banks.hard.contentVersion).toBe(before.hard.contentVersion);
  });

  it('bundles the Easy bank of every track and no Medium or Hard bank', async () => {
    await buildContentManifest(contentDir, outputs);

    const bundle = await readFile(outputs.banksPath, 'utf8');
    const bundledKeys = [...bundle.matchAll(/^ {2}'([^']+)': require/gm)].map(([, key]) => key);
    const trackIds = (await readManifest()).languages.map(({ id }) => id);
    expect(bundledKeys.sort()).toEqual(trackIds.map((id) => `${id}/easy`).sort());
  });

  describe('misconceptions', () => {
    beforeEach(async () => {
      // The real banks link the real taxonomy; each test here supplies its own.
      await stripMisconceptionLinks(contentDir);
      await writeFile(join(taxonomyDir, 'python.json'), JSON.stringify([ENTRY_A, ENTRY_B]));
    });

    it('ships an entry that only a Medium card links', async () => {
      await linkFirstCard('python/medium.json', ENTRY_B.id);

      await buildContentManifest(contentDir, outputs, taxonomyDir);

      expect(findPython(await readManifest()).misconceptions).toEqual([ENTRY_B]);
    });

    it('drops an entry the manifest lists when no card in any bank links it', async () => {
      const manifest = await readManifest();
      findPython(manifest).misconceptions = [ENTRY_A];
      await writeManifest(manifest);
      await linkFirstCard('python/hard.json', ENTRY_B.id);

      await buildContentManifest(contentDir, outputs, taxonomyDir);

      expect(findPython(await readManifest()).misconceptions).toEqual([ENTRY_B]);
    });
  });
});
