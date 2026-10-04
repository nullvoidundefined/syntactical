// B-37a: readPaidBanks loads every paid bank's exact bytes from PAID_CONTENT_DIR, verified
// against the manifest hash at startup, and never reads a paid bank from the public
// content directory.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readPaidBanks } from '../../services/readServerBank.js';
import type { PaidBank } from '../../types/PaidBank.js';
import type { PaidBanks } from '../../types/PaidBanks.js';

const PROVENANCE = {
  isHumanReviewed: false,
  source: 'original',
  validation: { method: 'judged', status: 'pending' },
};

const QUERY = { explanation: 'Because the language says so.', title: 'A rule' };

function buildMcQuestion(id: string, prompt: string): Record<string, unknown> {
  const choices = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];
  return { answerIndex: 1, choices, id, prompt, provenance: PROVENANCE, query: QUERY, type: 'mc' };
}

// Pretty-printed with non-ASCII text, so a reader that re-serializes or re-encodes the
// bank changes its bytes.
function serializeBank(id: string, prompt: string): Buffer {
  const text = JSON.stringify({ questions: [buildMcQuestion(id, prompt)], schemaVersion: 2 }, null, 2);
  return Buffer.from(`${text}\n`, 'utf8');
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function buildBankEntry(path: string, hash: string, access: 'free' | 'paid', productId?: string) {
  const entry: Record<string, unknown> = { access, contentVersion: 1, hash, path, topicCounts: {} };
  if (productId) entry.productId = productId;
  return entry;
}

function buildLanguage(id: string, grammar: string, banks: Record<string, unknown>) {
  return { banks, glyph: 'XX', grammar, id, label: id, misconceptions: [], tagline: 'Tagline.', topics: [] };
}

const FREE_EASY = serializeBank('py-easy', 'Free prompt');
const PYTHON_MEDIUM = serializeBank('py-medium', 'Paid prompt: café “quotes”');
const PYTHON_HARD = serializeBank('py-hard', 'Paid hard prompt');
const POSTGRES_MEDIUM = serializeBank('pg-medium', 'Paid SQL prompt');
const PUBLIC_DECOY = serializeBank('py-medium-public', 'Old public text');

let contentDir: string;
let paidContentDir: string;
const extraDirs: string[] = [];

async function writeFileUnder(root: string, relativePath: string, bytes: Buffer | string): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
}

async function writeManifest(languages: unknown[]): Promise<void> {
  await writeFileUnder(contentDir, 'manifest.json', JSON.stringify({ languages, schemaVersion: 2 }));
}

async function writeStandardManifest(overrides: { pythonMediumHash?: string } = {}): Promise<void> {
  await writeManifest([
    buildLanguage('python', 'python', {
      easy: buildBankEntry('python/easy.json', sha256Hex(FREE_EASY), 'free'),
      hard: buildBankEntry('python/hard.json', sha256Hex(PYTHON_HARD), 'paid', 'syntactical.python.hard'),
      medium: buildBankEntry(
        'python/medium.json',
        overrides.pythonMediumHash ?? sha256Hex(PYTHON_MEDIUM),
        'paid',
        'syntactical.python.medium',
      ),
    }),
    buildLanguage('postgres', 'sql', {
      medium: buildBankEntry(
        'postgres/medium.json',
        sha256Hex(POSTGRES_MEDIUM),
        'paid',
        'syntactical.postgres.medium',
      ),
    }),
  ]);
}

async function writePaidFiles(root: string): Promise<void> {
  await writeFileUnder(root, 'python/medium.json', PYTHON_MEDIUM);
  await writeFileUnder(root, 'python/hard.json', PYTHON_HARD);
  await writeFileUnder(root, 'postgres/medium.json', POSTGRES_MEDIUM);
}

function expectBank(banks: PaidBanks, key: string, bytes: Buffer, productId: string): void {
  const bank: PaidBank | undefined = banks.get(key);
  expect(bank).toBeDefined();
  expect(Buffer.isBuffer(bank?.body)).toBe(true);
  expect(bank?.body.equals(bytes)).toBe(true);
  expect(sha256Hex(bank?.body ?? Buffer.alloc(0))).toBe(sha256Hex(bytes));
  expect(bank?.productId).toBe(productId);
}

beforeEach(async () => {
  contentDir = await mkdtemp(join(tmpdir(), 'paid-banks-content-'));
  paidContentDir = await mkdtemp(join(tmpdir(), 'paid-banks-private-'));
});

afterEach(async () => {
  await rm(contentDir, { force: true, recursive: true });
  await rm(paidContentDir, { force: true, recursive: true });
  for (const dir of extraDirs.splice(0)) await rm(dir, { force: true, recursive: true });
});

describe('readPaidBanks', () => {
  it('returns each paid bank keyed language/difficulty with its exact bytes and productId', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writePaidFiles(paidContentDir);
    await writeStandardManifest();

    const banks = await readPaidBanks(contentDir, paidContentDir);

    expect([...banks.keys()].sort()).toEqual(['postgres/medium', 'python/hard', 'python/medium']);
    expectBank(banks, 'python/medium', PYTHON_MEDIUM, 'syntactical.python.medium');
    expectBank(banks, 'python/hard', PYTHON_HARD, 'syntactical.python.hard');
    expectBank(banks, 'postgres/medium', POSTGRES_MEDIUM, 'syntactical.postgres.medium');
  });

  it('contains no free bank, even when the free bank file also sits under paidContentDir', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(paidContentDir, 'python/easy.json', FREE_EASY);
    await writePaidFiles(paidContentDir);
    await writeStandardManifest();

    const banks = await readPaidBanks(contentDir, paidContentDir);

    expect(banks.has('python/easy')).toBe(false);
    expect(banks.size).toBe(3);
  });

  it('reads the paid bytes from paidContentDir, never a public copy at the same path under contentDir', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(contentDir, 'python/medium.json', PUBLIC_DECOY);
    await writePaidFiles(paidContentDir);
    await writeStandardManifest();

    const banks = await readPaidBanks(contentDir, paidContentDir);

    expectBank(banks, 'python/medium', PYTHON_MEDIUM, 'syntactical.python.medium');
    expect(banks.get('python/medium')?.body.equals(PUBLIC_DECOY)).toBe(false);
  });

  it('rejects when a paid bank file is missing from paidContentDir, even with a matching public copy', async () => {
    await writeFileUnder(contentDir, 'python/medium.json', PYTHON_MEDIUM);
    await writeFileUnder(paidContentDir, 'python/hard.json', PYTHON_HARD);
    await writeFileUnder(paidContentDir, 'postgres/medium.json', POSTGRES_MEDIUM);
    await writeStandardManifest();

    await expect(readPaidBanks(contentDir, paidContentDir)).rejects.toThrow();
  });

  it('rejects when a paid bank hash differs from the manifest', async () => {
    await writePaidFiles(paidContentDir);
    await writeStandardManifest({ pythonMediumHash: sha256Hex(Buffer.concat([PYTHON_MEDIUM, Buffer.from(' ')])) });

    await expect(readPaidBanks(contentDir, paidContentDir)).rejects.toThrow();
  });

  it('rejects an unsafe paid bank path, even when the file it names exists with a matching hash', async () => {
    // `../<paid dir name>/python/medium.json` from contentDir reaches the real paid file.
    const escapingPath = `../${paidContentDir.split('/').pop()}/python/medium.json`;
    await writePaidFiles(paidContentDir);
    await writeManifest([
      buildLanguage('python', 'python', {
        medium: buildBankEntry(escapingPath, sha256Hex(PYTHON_MEDIUM), 'paid', 'syntactical.python.medium'),
      }),
    ]);

    await expect(readPaidBanks(contentDir, paidContentDir)).rejects.toThrow();
  });

  it('rejects a paidContentDir equal to contentDir', async () => {
    await writePaidFiles(contentDir);
    await writeStandardManifest();

    await expect(readPaidBanks(contentDir, contentDir)).rejects.toThrow();
    await expect(readPaidBanks(contentDir, `${contentDir}/`)).rejects.toThrow();
  });

  it('rejects a paidContentDir inside contentDir, however the path is spelled', async () => {
    const nested = join(contentDir, 'private');
    await writePaidFiles(nested);
    await writeStandardManifest();

    await expect(readPaidBanks(contentDir, nested)).rejects.toThrow();
    await expect(readPaidBanks(contentDir, `${contentDir}/python/../private`)).rejects.toThrow();
  });

  it('accepts a sibling paidContentDir whose name starts with the contentDir name', async () => {
    const sibling = `${contentDir}-paid`;
    extraDirs.push(sibling);
    await writePaidFiles(sibling);
    await writeStandardManifest();

    const banks = await readPaidBanks(contentDir, sibling);

    expectBank(banks, 'python/medium', PYTHON_MEDIUM, 'syntactical.python.medium');
  });
});
