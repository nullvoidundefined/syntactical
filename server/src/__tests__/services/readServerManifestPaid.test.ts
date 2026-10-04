// B-37a: readServerManifest reads a bank with access 'paid' only from PAID_CONTENT_DIR, never
// from the public content directory, and refuses to start when a paid bank is missing or
// tampered, or when the paid directory sits inside the content directory.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readServerManifest } from '../../services/readServerManifest.js';

const PROVENANCE = {
  isHumanReviewed: false,
  source: 'original',
  validation: { method: 'judged', status: 'pending' },
};

const QUERY = { explanation: 'Because the language says so.', title: 'A rule' };

function buildMcQuestion(id: string, answerIndex: number, choiceCount: number): Record<string, unknown> {
  const choices = Array.from({ length: choiceCount }, (_unused, index) => ({ text: `choice ${index}` }));
  return { answerIndex, choices, id, prompt: `Prompt ${id}`, provenance: PROVENANCE, query: QUERY, type: 'mc' };
}

function serializeBank(questions: unknown[]): string {
  return JSON.stringify({ questions, schemaVersion: 2 });
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function buildBankEntry(path: string, hash: string, access: 'free' | 'paid', productId?: string) {
  const entry: Record<string, unknown> = { access, contentVersion: 1, hash, path, topicCounts: {} };
  if (productId) entry.productId = productId;
  return entry;
}

function buildLanguage(id: string, grammar: string, banks: Record<string, unknown>) {
  return { banks, glyph: 'XX', grammar, id, label: id, misconceptions: [], tagline: 'Tagline.', topics: [] };
}

const FREE_EASY = serializeBank([buildMcQuestion('py-easy', 1, 3)]);
const PAID_MEDIUM = serializeBank([buildMcQuestion('py-medium-paid', 2, 4)]);
// The old public medium text: a different question set, still present in the public repo.
const PUBLIC_MEDIUM_DECOY = serializeBank([buildMcQuestion('py-medium-public', 0, 2)]);

let contentDir: string;
let paidContentDir: string;
const extraDirs: string[] = [];

async function writeFileUnder(root: string, relativePath: string, text: string): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, text, 'utf8');
}

async function writeManifest(languages: unknown[]): Promise<void> {
  await writeFileUnder(contentDir, 'manifest.json', JSON.stringify({ languages, schemaVersion: 2 }));
}

async function writeFreeAndPaidManifest(paidHash = sha256Hex(PAID_MEDIUM)): Promise<void> {
  await writeManifest([
    buildLanguage('python', 'python', {
      easy: buildBankEntry('python/easy.json', sha256Hex(FREE_EASY), 'free'),
      medium: buildBankEntry('python/medium.json', paidHash, 'paid', 'syntactical.python.medium'),
    }),
  ]);
}

// A startup that should succeed: a rejection fails as an assertion that names the reason.
async function loadAnswerKey(...args: Parameters<typeof readServerManifest>) {
  const pending = readServerManifest(...args);
  await expect(pending).resolves.toBeInstanceOf(Map);
  return pending;
}

beforeEach(async () => {
  contentDir = await mkdtemp(join(tmpdir(), 'paid-manifest-content-'));
  paidContentDir = await mkdtemp(join(tmpdir(), 'paid-manifest-private-'));
});

afterEach(async () => {
  await rm(contentDir, { force: true, recursive: true });
  await rm(paidContentDir, { force: true, recursive: true });
  for (const dir of extraDirs.splice(0)) await rm(dir, { force: true, recursive: true });
});

describe('readServerManifest with paid banks', () => {
  it('reads the paid bank from paidContentDir and the free bank from contentDir, ignoring a public paid copy', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    // The decoy carries different bytes, so reading it would also break the hash check.
    await writeFileUnder(contentDir, 'python/medium.json', PUBLIC_MEDIUM_DECOY);
    await writeFileUnder(paidContentDir, 'python/medium.json', PAID_MEDIUM);
    await writeFreeAndPaidManifest();

    const answerKey = await loadAnswerKey(contentDir, paidContentDir);

    expect([...answerKey.keys()].sort()).toEqual(['python/easy', 'python/medium']);
    expect(answerKey.get('python/easy')?.get('py-easy')).toEqual({ answerIndex: 1, choiceCount: 3 });
    const medium = answerKey.get('python/medium');
    expect([...(medium?.keys() ?? [])]).toEqual(['py-medium-paid']);
    expect(medium?.get('py-medium-paid')).toEqual({ answerIndex: 2, choiceCount: 4 });
    expect(medium?.has('py-medium-public')).toBe(false);
  });

  it('skips a paid bank when no paidContentDir is given, even when contentDir holds a matching file', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    // Hash matches the manifest, so only the access rule keeps this bank out.
    await writeFileUnder(contentDir, 'python/medium.json', PAID_MEDIUM);
    await writeFreeAndPaidManifest();

    const answerKey = await loadAnswerKey(contentDir);

    expect([...answerKey.keys()]).toEqual(['python/easy']);
    expect(answerKey.has('python/medium')).toBe(false);
  });

  it('does not load a free bank that exists only under paidContentDir', async () => {
    await writeFileUnder(paidContentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(paidContentDir, 'python/medium.json', PAID_MEDIUM);
    await writeFreeAndPaidManifest();

    const answerKey = await loadAnswerKey(contentDir, paidContentDir);

    expect([...answerKey.keys()]).toEqual(['python/medium']);
    expect(answerKey.has('python/easy')).toBe(false);
  });

  it('rejects when a paid bank file is missing from paidContentDir, even with a matching public copy', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(contentDir, 'python/medium.json', PAID_MEDIUM);
    await writeFreeAndPaidManifest();

    await expect(readServerManifest(contentDir, paidContentDir)).rejects.toThrow();
  });

  it('rejects when a paid bank hash differs from the manifest', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(paidContentDir, 'python/medium.json', `${PAID_MEDIUM}\n`);
    await writeFreeAndPaidManifest();

    await expect(readServerManifest(contentDir, paidContentDir)).rejects.toThrow();
  });

  it('rejects a paidContentDir equal to contentDir', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(contentDir, 'python/medium.json', PAID_MEDIUM);
    await writeFreeAndPaidManifest();

    await expect(readServerManifest(contentDir, contentDir)).rejects.toThrow();
    await expect(readServerManifest(contentDir, `${contentDir}/`)).rejects.toThrow();
  });

  it('rejects a paidContentDir inside contentDir, however the path is spelled', async () => {
    const nested = join(contentDir, 'private');
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(nested, 'python/medium.json', PAID_MEDIUM);
    await writeFreeAndPaidManifest();

    await expect(readServerManifest(contentDir, nested)).rejects.toThrow();
    await expect(readServerManifest(contentDir, `${contentDir}/python/../private`)).rejects.toThrow();
  });

  it('accepts a sibling paidContentDir whose name starts with the contentDir name', async () => {
    const sibling = `${contentDir}-paid`;
    extraDirs.push(sibling);
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(sibling, 'python/medium.json', PAID_MEDIUM);
    await writeFreeAndPaidManifest();

    const answerKey = await loadAnswerKey(contentDir, sibling);

    expect(answerKey.get('python/medium')?.get('py-medium-paid')).toEqual({ answerIndex: 2, choiceCount: 4 });
  });
});
