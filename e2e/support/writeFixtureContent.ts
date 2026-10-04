// Builds the content the e2e run serves: a public directory (the repository's manifest with its
// free banks copied unchanged, so the web bundle's own free banks still match) and a separate
// paid directory. The private paid banks are not in this repository, so each paid manifest entry
// gets a small fixture bank made from the free bank of the same language, with its hash written
// into the copied manifest. The server reads both directories; the web host serves only the
// public one.
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface BankEntry {
  access: 'free' | 'paid';
  hash: string;
  path: string;
  topicCounts: Record<string, number>;
}

interface Manifest {
  languages: Array<{ banks: Record<string, BankEntry>; id: string }>;
}

interface Question {
  id: string;
  topic?: string;
  [key: string]: unknown;
}

const FIXTURE_QUESTION_COUNT = 5;

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeUnder(root: string, path: string, bytes: Buffer): Promise<void> {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

async function writeFixtureContent(options: {
  contentSource: string;
  paidDir: string;
  publicDir: string;
}): Promise<void> {
  const { contentSource, paidDir, publicDir } = options;
  const manifest = JSON.parse(await readFile(join(contentSource, 'manifest.json'), 'utf8')) as Manifest;
  for (const language of manifest.languages) {
    const freeEntry = Object.values(language.banks).find(({ access }) => access === 'free');
    if (freeEntry === undefined) throw new Error(`language ${language.id} has no free bank to derive fixtures from`);
    const freeText = await readFile(join(contentSource, freeEntry.path), 'utf8');
    for (const [difficulty, entry] of Object.entries(language.banks)) {
      if (entry.access === 'free') {
        await mkdir(dirname(join(publicDir, entry.path)), { recursive: true });
        await cp(join(contentSource, entry.path), join(publicDir, entry.path));
        continue;
      }
      const free = JSON.parse(freeText) as { questions: Question[]; schemaVersion: number };
      const questions = free.questions.slice(0, FIXTURE_QUESTION_COUNT).map((question, index) => ({
        ...question,
        id: `e2e-${language.id}-${difficulty}-${String(index + 1).padStart(2, '0')}`,
      }));
      const bytes = Buffer.from(`${JSON.stringify({ ...free, questions }, null, 2)}\n`, 'utf8');
      await writeUnder(paidDir, entry.path, bytes);
      entry.hash = sha256Hex(bytes);
      entry.topicCounts = {};
      for (const { topic } of questions) {
        if (topic !== undefined) entry.topicCounts[topic] = (entry.topicCounts[topic] ?? 0) + 1;
      }
    }
  }
  await writeUnder(publicDir, 'manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
}

export { writeFixtureContent };
