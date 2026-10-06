import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');
// Every language in the shipped manifest, so adding a language does not break these tests.
const LANGUAGE_IDS = (
  JSON.parse(readFileSync(join(REPOSITORY_CONTENT_DIR, 'manifest.json'), 'utf8')) as { languages: { id: string }[] }
).languages.map(({ id }) => id);
// Only free banks are in the public content tree (B-60); paid banks live in syntactical-content.
const FREE_DIFFICULTY_IDS = ['easy'];
const STALE_HASH = 'a'.repeat(64);
const UTF8_BYTE_ORDER_MARK = Buffer.from([0xef, 0xbb, 0xbf]);

type BankEntry = { access: 'free' | 'paid'; path: string; hash: string; contentVersion: number };
type ManifestLanguage = { id: string; banks: Record<string, BankEntry> } & Record<string, unknown>;
type ManifestDocument = { schemaVersion: number; languages: ManifestLanguage[] };
type GeneratedModule = { BUNDLED_MANIFEST: ManifestDocument; BUNDLED_BANKS: Record<string, unknown> };

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function hashFileBytes(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

function loadGeneratedModule(generatedPath: string): GeneratedModule {
  let generatedModule: GeneratedModule | undefined;
  jest.isolateModules(() => {
    generatedModule = require(generatedPath) as GeneratedModule;
  });
  return generatedModule as GeneratedModule;
}

describe('buildContentManifest', () => {
  let workDir: string;
  let contentDir: string;
  let generatedPath: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'content-manifest-'));
    contentDir = join(workDir, 'content');
    generatedPath = join(workDir, 'bundledContent.ts');
    await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes the lowercase hex SHA-256 of each bank file into the manifest, replacing empty and stale hashes', async () => {
    const manifestPath = join(contentDir, 'manifest.json');
    const originalManifest = await readJsonFile<ManifestDocument>(manifestPath);
    originalManifest.languages[0].banks.easy.hash = STALE_HASH;
    await writeJsonFile(manifestPath, originalManifest);

    await buildContentManifest(contentDir, generatedPath);

    const rewrittenManifest = await readJsonFile<ManifestDocument>(manifestPath);
    const expectedLanguages = await Promise.all(
      originalManifest.languages.map(async (language) => {
        const bankEntries = await Promise.all(
          Object.entries(language.banks).map(async ([difficulty, bank]) => [
            difficulty,
            // A paid bank is not read without a private content root, so its entry stays as it was.
            bank.access === 'paid'
              ? bank
              : {
                  ...bank,
                  // Only the bank whose recorded hash was stale changed, so only it bumps.
                  contentVersion: bank.hash === STALE_HASH ? bank.contentVersion + 1 : bank.contentVersion,
                  hash: await hashFileBytes(join(contentDir, bank.path)),
                },
          ]),
        );
        return { ...language, banks: Object.fromEntries(bankEntries) };
      }),
    );
    expect(rewrittenManifest).toEqual({ ...originalManifest, languages: expectedLanguages });

    const writtenHashes = rewrittenManifest.languages.flatMap((language) =>
      Object.values(language.banks)
        .filter((bank) => bank.access === 'free')
        .map((bank) => bank.hash),
    );
    expect(writtenHashes).toHaveLength(LANGUAGE_IDS.length * FREE_DIFFICULTY_IDS.length);
    for (const writtenHash of writtenHashes) {
      expect(writtenHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(writtenHashes).not.toContain(STALE_HASH);
  });

  it('writes a module exporting the hashed manifest and every free bank keyed by language and difficulty', async () => {
    await buildContentManifest(contentDir, generatedPath);

    const rewrittenManifest = await readJsonFile<ManifestDocument>(join(contentDir, 'manifest.json'));
    const generatedModule = loadGeneratedModule(generatedPath);

    expect(generatedModule.BUNDLED_MANIFEST).toEqual(rewrittenManifest);

    const expectedBankKeys = LANGUAGE_IDS.flatMap((language) =>
      FREE_DIFFICULTY_IDS.map((difficulty) => `${language}/${difficulty}`),
    );
    expect(Object.keys(generatedModule.BUNDLED_BANKS).sort()).toEqual([...expectedBankKeys].sort());

    for (const bankKey of expectedBankKeys) {
      const bankFile = await readJsonFile<unknown>(join(contentDir, `${bankKey}.json`));
      expect(generatedModule.BUNDLED_BANKS[bankKey]).toEqual(bankFile);
    }
  });

  it('references each bank with a relative require path rather than an absolute one', async () => {
    await buildContentManifest(contentDir, generatedPath);

    const generatedSource = await readFile(generatedPath, 'utf8');

    expect(generatedSource).not.toContain(workDir);
    for (const language of LANGUAGE_IDS) {
      for (const difficulty of FREE_DIFFICULTY_IDS) {
        expect(generatedSource).toMatch(
          new RegExp(`require\\(\\s*['"]\\.\\.?/[^'"]*${language}/${difficulty}\\.json['"]\\s*\\)`),
        );
      }
    }
  });

  it('rejects naming the bank path when a bank is invalid as a whole', async () => {
    await writeJsonFile(join(contentDir, 'python', 'easy.json'), { schemaVersion: 2, questions: [] });

    await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(/python\/easy\.json/);
  });

  it('rejects naming the bank path when a bank contains a question validation would drop', async () => {
    const bankPath = join(contentDir, 'python', 'easy.json');
    const bankFile = await readJsonFile<{ schemaVersion: number; questions: Record<string, unknown>[] }>(bankPath);
    bankFile.questions[0] = {
      ...bankFile.questions[0],
      type: 'mc',
      choices: [{ text: 'only one choice' }],
      answerIndex: 0,
    };
    await writeJsonFile(bankPath, bankFile);

    await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(/python\/easy\.json/);
  });

  it('rejects naming the manifest when the manifest repeats a language id', async () => {
    const manifestPath = join(contentDir, 'manifest.json');
    const manifest = await readJsonFile<ManifestDocument>(manifestPath);
    manifest.languages[1].id = manifest.languages[0].id;
    await writeJsonFile(manifestPath, manifest);

    await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(/manifest/);
  });

  it('rejects naming the manifest, not a TypeError, when a language topic list is malformed', async () => {
    const manifest = await readJsonFile<{ languages: Record<string, unknown>[] }>(join(contentDir, 'manifest.json'));
    manifest.languages[0].topics = [null];
    await writeJsonFile(join(contentDir, 'manifest.json'), manifest);
    await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(/manifest\.json is invalid/);
  });

  it('rejects a bank file that starts with a UTF-8 byte-order mark', async () => {
    const bankPath = join(contentDir, 'javascript', 'easy.json');
    const bankBytes = await readFile(bankPath);
    await writeFile(bankPath, Buffer.concat([UTF8_BYTE_ORDER_MARK, bankBytes]));

    await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(/byte-order mark/);
  });
});
