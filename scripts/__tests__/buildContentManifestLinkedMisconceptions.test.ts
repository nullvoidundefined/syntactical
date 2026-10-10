// The manifest ships only the misconceptions some card links to: each approved taxonomy is
// narrowed to the entries a question in that language's banks references.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');
const ENTRY_A = { description: 'Believes default arguments are rebuilt on each call.', id: 'python.entry-a' };
const ENTRY_B = { description: 'Believes a list copy is always deep.', id: 'python.entry-b' };
const ENTRY_C = { description: 'Believes integers are mutable.', id: 'python.entry-c' };
const TAXONOMY = [ENTRY_A, ENTRY_B, ENTRY_C];

type Choice = { misconceptionId?: string; rationale?: string };
type Question = { answerIndex?: number; choices?: Choice[]; type: string };
type Bank = { questions: Question[] };
type Manifest = { languages: { id: string; misconceptions: { description: string; id: string }[] }[] };

describe('buildContentManifest linked misconceptions', () => {
  let workDir: string;
  let contentDir: string;
  let contentRoot: string;
  let taxonomyDir: string;
  let outputs: { banksPath: string; manifestPath: string };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'content-linked-'));
    contentDir = join(workDir, 'content');
    contentRoot = join(workDir, 'private');
    taxonomyDir = join(workDir, 'taxonomy');
    outputs = { banksPath: join(workDir, 'banks.ts'), manifestPath: join(workDir, 'manifest.ts') };
    await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
    await mkdir(taxonomyDir);
    await writeFile(join(taxonomyDir, 'python.json'), JSON.stringify(TAXONOMY));
    // Paid banks live in the private repo; each stand-in here is the language's free easy bank.
    for (const { id } of (await readManifest()).languages) {
      await mkdir(join(contentRoot, id), { recursive: true });
      for (const difficulty of ['medium', 'hard']) {
        await cp(join(contentDir, id, 'easy.json'), join(contentRoot, id, `${difficulty}.json`));
      }
    }
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  async function readManifest(): Promise<Manifest> {
    return JSON.parse(await readFile(join(contentDir, 'manifest.json'), 'utf8')) as Manifest;
  }

  async function readPythonMisconceptions(): Promise<unknown> {
    return (await readManifest()).languages.find(({ id }) => id === 'python')?.misconceptions;
  }

  async function seedPythonMisconceptions(entries: unknown[]): Promise<void> {
    const manifest = await readManifest();
    const python = manifest.languages.find(({ id }) => id === 'python');
    if (python) python.misconceptions = entries as never;
    await writeFile(join(contentDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  // Makes the first wrong choice of the first multiple-choice question carry `misconceptionId`.
  async function linkFirstCard(bankPath: string, misconceptionId: string): Promise<void> {
    const bank = JSON.parse(await readFile(bankPath, 'utf8')) as Bank;
    const question = bank.questions.find(({ type }) => type === 'mc') as Question;
    const choice = (question.choices as Choice[])[question.answerIndex === 0 ? 1 : 0];
    choice.misconceptionId = misconceptionId;
    choice.rationale = 'This is the mistaken reading, and the real behavior differs for a stated reason.';
    await writeFile(bankPath, `${JSON.stringify(bank, null, 2)}\n`);
  }

  it('ships no misconceptions when no card references an approved taxonomy entry', async () => {
    await buildContentManifest(contentDir, outputs, taxonomyDir);

    expect(await readPythonMisconceptions()).toEqual([]);
  });

  it('ships exactly the entry a free-bank card references', async () => {
    await linkFirstCard(join(contentDir, 'python', 'easy.json'), ENTRY_A.id);

    await buildContentManifest(contentDir, outputs, taxonomyDir);

    expect(await readPythonMisconceptions()).toEqual([ENTRY_A]);
  });

  it('adds entries a paid bank in the content root references, in taxonomy order', async () => {
    await linkFirstCard(join(contentRoot, 'python', 'medium.json'), ENTRY_B.id);
    await linkFirstCard(join(contentDir, 'python', 'easy.json'), ENTRY_A.id);

    await buildContentManifest(contentDir, outputs, taxonomyDir, contentRoot);

    expect(await readPythonMisconceptions()).toEqual([ENTRY_A, ENTRY_B]);
  });

  it('without a content root keeps an entry the manifest lists and the taxonomy still has', async () => {
    const entryNoLongerInTaxonomy = { description: 'Removed from the taxonomy.', id: 'python.entry-gone' };
    await seedPythonMisconceptions([ENTRY_B, entryNoLongerInTaxonomy]);

    await buildContentManifest(contentDir, outputs, taxonomyDir);

    expect(await readPythonMisconceptions()).toEqual([ENTRY_B]);
  });

  it('rebuilds the same manifest when run twice without a content root', async () => {
    await seedPythonMisconceptions([ENTRY_B]);
    await linkFirstCard(join(contentDir, 'python', 'easy.json'), ENTRY_C.id);

    await buildContentManifest(contentDir, outputs, taxonomyDir);
    const first = await readFile(join(contentDir, 'manifest.json'), 'utf8');
    await buildContentManifest(contentDir, outputs, taxonomyDir);

    expect(await readFile(join(contentDir, 'manifest.json'), 'utf8')).toBe(first);
    expect(await readPythonMisconceptions()).toEqual([ENTRY_B, ENTRY_C]);
  });
});
