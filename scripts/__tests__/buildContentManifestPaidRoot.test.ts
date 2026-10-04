// The manifest build with a private content root: paid banks are hashed from there, counted per
// topic, versioned only when their bytes change, and left out of the generated bundle.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');

type Manifest = {
  languages: {
    banks: Record<string, { contentVersion: number; hash: string; topicCounts: Record<string, number> }>;
    id: string;
  }[];
};

async function readManifest(contentDir: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(contentDir, 'manifest.json'), 'utf8')) as Manifest;
}

describe('buildContentManifest with a private content root', () => {
  let workDir: string;
  let contentDir: string;
  let contentRoot: string;
  let outputs: { banksPath: string; manifestPath: string };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'content-root-'));
    contentDir = join(workDir, 'content');
    contentRoot = join(workDir, 'private');
    outputs = { banksPath: join(workDir, 'banks.ts'), manifestPath: join(workDir, 'manifest.ts') };
    await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
    // The real paid banks live in the private syntactical-content repo, never in this one (B-60),
    // so each paid bank here is a stand-in: the same language's free bank bytes.
    for (const language of ['javascript', 'postgres', 'python']) {
      await mkdir(join(contentRoot, language), { recursive: true });
      for (const difficulty of ['medium', 'hard']) {
        await cp(join(contentDir, language, 'easy.json'), join(contentRoot, language, `${difficulty}.json`));
      }
    }
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  it('hashes a paid bank from the content root and leaves paid banks out of the bundle', async () => {
    await buildContentManifest(contentDir, outputs, undefined, undefined, contentRoot);

    const bundle = await readFile(outputs.banksPath, 'utf8');
    expect(bundle).toContain("'python/easy'");
    expect(bundle).not.toContain("'python/medium'");
    expect(bundle).not.toContain("'python/hard'");
  });

  it('counts questions per topic and bumps contentVersion only when a bank changed', async () => {
    const bankPath = join(contentRoot, 'python', 'medium.json');
    const bank = JSON.parse(await readFile(bankPath, 'utf8')) as { questions: { topic?: string }[] };
    const manifestPath = join(contentDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      languages: { id: string; topics: unknown[] }[];
    };
    manifest.languages[0].topics = [{ id: 'strings', label: 'Strings' }];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    bank.questions[0].topic = 'strings';
    await writeFile(bankPath, `${JSON.stringify(bank, null, 2)}\n`);

    await buildContentManifest(contentDir, outputs, undefined, undefined, contentRoot);
    const changed = (await readManifest(contentDir)).languages[0].banks;
    expect(changed.medium).toMatchObject({ contentVersion: 2, topicCounts: { strings: 1 } });
    expect(changed.easy.contentVersion).toBe(1);

    await buildContentManifest(contentDir, outputs, undefined, undefined, contentRoot);
    expect((await readManifest(contentDir)).languages[0].banks).toEqual(changed);
  });
});
