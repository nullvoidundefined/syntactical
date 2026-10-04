// B-37c: the paid content directory guard refuses every route into the public content
// directory. readPaidBanks and readServerManifest refuse a paid directory that is a child of
// contentDir whose name starts with two dots, a paid directory that is an ancestor of
// contentDir, and a paid bank file or language subdirectory under an otherwise separate paid
// directory that is a symlink into contentDir, even when the bytes match the manifest hash.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readPaidBanks } from '../../services/readServerBank.js';
import { readServerManifest } from '../../services/readServerManifest.js';

// The implementer may word the refusal, but it must say the content directory is the reason.
const REFUSAL = /content directory/i;

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

// The manifest under contentDir names a free python/easy and a paid python/medium whose hash
// matches PAID_MEDIUM, so only a directory or symlink rule can refuse the load.
async function writeManifest(): Promise<void> {
  const banks = {
    easy: { access: 'free', contentVersion: 1, hash: sha256Hex(FREE_EASY), path: 'python/easy.json', topicCounts: {} },
    medium: {
      access: 'paid',
      contentVersion: 1,
      hash: sha256Hex(PAID_MEDIUM),
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

// The public content directory holds the free bank and a public copy of the paid bank whose
// bytes match the manifest hash.
async function writePublicContent(): Promise<void> {
  await writeFileUnder(contentDir, 'python/easy.json', FREE_EASY);
  await writeFileUnder(contentDir, 'python/medium.json', PAID_MEDIUM);
  await writeManifest();
}

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'paid-hardening-'));
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

describe.each(loaders)('$name refuses every route into the content directory', ({ load }) => {
  it('refuses a paid directory inside contentDir whose name starts with two dots', async () => {
    await writePublicContent();
    const dotted = join(contentDir, '..private');
    await writeFileUnder(dotted, 'python/medium.json', PAID_MEDIUM);

    await expect(load(contentDir, dotted)).rejects.toThrow(REFUSAL);
  });

  it('refuses a paid directory that is an ancestor of contentDir', async () => {
    await writePublicContent();
    // baseDir holds contentDir, and its own python/medium.json matches the manifest hash.
    await writeFileUnder(baseDir, 'python/medium.json', PAID_MEDIUM);

    await expect(load(contentDir, baseDir)).rejects.toThrow(REFUSAL);
  });

  it('refuses a paid bank file that is a symlink to the public copy under contentDir', async () => {
    await writePublicContent();
    await mkdir(join(paidContentDir, 'python'), { recursive: true });
    await symlink(join(contentDir, 'python/medium.json'), join(paidContentDir, 'python/medium.json'));

    await expect(load(contentDir, paidContentDir)).rejects.toThrow(REFUSAL);
  });

  it('refuses a paid language subdirectory that is a symlink to the same subdirectory under contentDir', async () => {
    await writePublicContent();
    await symlink(join(contentDir, 'python'), join(paidContentDir, 'python'), 'dir');

    await expect(load(contentDir, paidContentDir)).rejects.toThrow(REFUSAL);
  });
});
