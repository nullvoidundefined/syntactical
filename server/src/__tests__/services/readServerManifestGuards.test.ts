// Guards on readServerManifest's failure paths (slice-critic candidates for B-33a): a bank
// the validator rejects as a whole, a read error other than a missing file, a missing
// manifest, and the reason each rejection names. Each fails if that path were widened to
// skip or load the bank.
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
const VALID_QUESTION = {
  answerIndex: 0,
  choices: [{ text: 'one' }, { text: 'two' }],
  id: 'py-mc',
  prompt: 'Prompt',
  provenance: PROVENANCE,
  query: QUERY,
  type: 'mc',
};

let contentDir: string;

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function writeContentFile(relativePath: string, text: string): Promise<void> {
  const fullPath = join(contentDir, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, text, 'utf8');
}

async function writeManifestFor(bankHash: string, schemaVersion = 2): Promise<void> {
  const easy = { access: 'free', contentVersion: 1, hash: bankHash, path: 'python/easy.json', topicCounts: {} };
  const python = {
    banks: { easy },
    glyph: 'PY',
    grammar: 'python',
    id: 'python',
    label: 'Python',
    misconceptions: [],
    tagline: 'Tagline.',
    topics: [],
  };
  await writeContentFile('manifest.json', JSON.stringify({ languages: [python], schemaVersion }));
}

beforeEach(async () => {
  contentDir = await mkdtemp(join(tmpdir(), 'read-server-manifest-guards-'));
});

afterEach(async () => {
  await rm(contentDir, { force: true, recursive: true });
});

describe('readServerManifest failure paths', () => {
  it('rejects a bank the validator rejects as a whole even when its hash matches', async () => {
    const bank = JSON.stringify({ questions: [VALID_QUESTION], schemaVersion: 99 });
    await writeContentFile('python/easy.json', bank);
    await writeManifestFor(sha256Hex(bank));

    await expect(readServerManifest(contentDir)).rejects.toThrow(/Invalid bank python\/easy\.json/);
  });

  it('rejects, rather than skips, a bank path that cannot be read as a file', async () => {
    await mkdir(join(contentDir, 'python', 'easy.json'), { recursive: true });
    await writeManifestFor(sha256Hex('anything'));

    await expect(readServerManifest(contentDir)).rejects.toThrow(/EISDIR/);
  });

  it('names a hash mismatch', async () => {
    const bank = JSON.stringify({ questions: [VALID_QUESTION], schemaVersion: 2 });
    await writeContentFile('python/easy.json', bank);
    await writeManifestFor(sha256Hex(`${bank} `));

    await expect(readServerManifest(contentDir)).rejects.toThrow(/hash mismatch/);
  });

  it('names an invalid manifest', async () => {
    const bank = JSON.stringify({ questions: [VALID_QUESTION], schemaVersion: 2 });
    await writeContentFile('python/easy.json', bank);
    await writeManifestFor(sha256Hex(bank), 99);

    await expect(readServerManifest(contentDir)).rejects.toThrow(/Invalid manifest/);
  });

  it('rejects when manifest.json is missing', async () => {
    await expect(readServerManifest(contentDir)).rejects.toThrow(/ENOENT/);
  });
});
