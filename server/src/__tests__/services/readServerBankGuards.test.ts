// B-37a guards: readPaidBanks and readServerManifest refuse a paid directory that is a symlink
// into the content directory, name the bank in a missing or tampered bank's error, and refuse a
// paid directory inside the content directory with a fixed message; readBankBytes refuses a
// bank path that climbs out of its root.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { BankEntry } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readBankBytes } from '../../services/readBankBytes.js';
import { readPaidBanks } from '../../services/readServerBank.js';
import { readServerManifest } from '../../services/readServerManifest.js';

const OUTSIDE_MESSAGE = /PAID_CONTENT_DIR must be outside the content directory/;

const PROVENANCE = {
  isHumanReviewed: false,
  source: 'original',
  validation: { method: 'judged', status: 'pending' },
};

const QUERY = { explanation: 'Because the language says so.', title: 'A rule' };

function buildMcQuestion(id: string): Record<string, unknown> {
  const choices = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];
  return { answerIndex: 1, choices, id, prompt: `Prompt ${id}`, provenance: PROVENANCE, query: QUERY, type: 'mc' };
}

function serializeBank(id: string): Buffer {
  return Buffer.from(`${JSON.stringify({ questions: [buildMcQuestion(id)], schemaVersion: 2 }, null, 2)}\n`);
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const FREE_EASY = serializeBank('py-easy');
const PAID_MEDIUM = serializeBank('py-medium');

let baseDir: string;
let contentDir: string;
let paidContentDir: string;

async function writeFileUnder(root: string, relativePath: string, bytes: Buffer | string): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
}

async function writeManifest(paidHash = sha256Hex(PAID_MEDIUM)): Promise<void> {
  const banks = {
    easy: { access: 'free', contentVersion: 1, hash: sha256Hex(FREE_EASY), path: 'python/easy.json', topicCounts: {} },
    medium: {
      access: 'paid',
      contentVersion: 1,
      hash: paidHash,
      path: 'python/medium.json',
      productId: 'syntactical.python.medium',
      topicCounts: {},
    },
  };
  const language = {
    banks,
    glyph: 'XX',
    grammar: 'python',
    id: 'python',
    label: 'python',
    misconceptions: [],
    tagline: 'Tagline.',
    topics: [],
  };
  await writeFileUnder(contentDir, 'manifest.json', JSON.stringify({ languages: [language], schemaVersion: 2 }));
}

async function writePublicContent(): Promise<void> {
  await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
  await writeFileUnder(contentDir, 'python/medium.json', PAID_MEDIUM);
  await writeManifest();
}

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'paid-guards-'));
  contentDir = join(baseDir, 'content');
  paidContentDir = join(baseDir, 'private');
  await mkdir(contentDir, { recursive: true });
  await mkdir(paidContentDir, { recursive: true });
});

afterEach(async () => {
  await rm(baseDir, { force: true, recursive: true });
});

const loaders = [
  { load: (content: string, paid: string) => readPaidBanks(content, paid), name: 'readPaidBanks' },
  { load: (content: string, paid: string) => readServerManifest(content, paid), name: 'readServerManifest' },
];

describe.each(loaders)('$name guards', ({ load }) => {
  it('refuses a paidContentDir that is a symlink to contentDir', async () => {
    await writePublicContent();
    const alias = join(baseDir, 'alias');
    await symlink(contentDir, alias, 'dir');

    await expect(load(contentDir, alias)).rejects.toThrow(OUTSIDE_MESSAGE);
  });

  it('refuses a paidContentDir that is a symlink to a subdirectory of contentDir', async () => {
    await writePublicContent();
    await writeFileUnder(contentDir, 'hidden/python/medium.json', PAID_MEDIUM);
    const alias = join(baseDir, 'alias');
    await symlink(join(contentDir, 'hidden'), alias, 'dir');

    await expect(load(contentDir, alias)).rejects.toThrow(OUTSIDE_MESSAGE);
  });

  it('refuses a paidContentDir inside contentDir with the fixed message', async () => {
    await writePublicContent();
    const nested = join(contentDir, 'private');
    await writeFileUnder(nested, 'python/medium.json', PAID_MEDIUM);

    await expect(load(contentDir, nested)).rejects.toThrow(OUTSIDE_MESSAGE);
  });

  it('names the missing paid bank path', async () => {
    await writePublicContent();

    await expect(load(contentDir, paidContentDir)).rejects.toThrow(/python\/medium\.json/);
  });

  it('rejects a hash mismatch with "Bank hash mismatch: <path>"', async () => {
    await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
    await writeFileUnder(paidContentDir, 'python/medium.json', PAID_MEDIUM);
    await writeManifest(sha256Hex(Buffer.concat([PAID_MEDIUM, Buffer.from(' ')])));

    await expect(load(contentDir, paidContentDir)).rejects.toThrow('Bank hash mismatch: python/medium.json');
  });
});

describe('readBankBytes', () => {
  it('rejects an entry whose path climbs out of the root', async () => {
    await writeFileUnder(baseDir, 'x.json', PAID_MEDIUM);
    const entry = {
      access: 'paid',
      contentVersion: 1,
      hash: sha256Hex(PAID_MEDIUM),
      path: '../x.json',
      productId: 'syntactical.python.medium',
      topicCounts: {},
    } as unknown as BankEntry;

    await expect(readBankBytes(contentDir, entry)).rejects.toThrow(/Unsafe bank path/);
  });
});
