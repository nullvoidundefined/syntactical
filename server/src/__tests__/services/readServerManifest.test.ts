// B-33a: the server builds an answer key from the content directory's manifest and bank
// files, so it can derive isCorrect from choiceIndex and reject unknown banks, unknown
// questions, and out-of-range choices.
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

function buildAbQuestion(id: string, answerIndex: number): Record<string, unknown> {
  return {
    answerIndex,
    choices: [{ text: 'option a' }, { text: 'option b' }],
    criterion: { evidence: 'It allocates less.', statement: 'Faster.', type: 'performance' },
    id,
    prompt: `Prompt ${id}`,
    provenance: PROVENANCE,
    query: QUERY,
    type: 'ab',
  };
}

function buildBoolQuestion(id: string, answer: boolean): Record<string, unknown> {
  return { answer, id, prompt: `Prompt ${id}`, provenance: PROVENANCE, query: QUERY, type: 'bool' };
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

let contentDir: string;

async function writeContentFile(relativePath: string, text: string): Promise<void> {
  const fullPath = join(contentDir, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, text, 'utf8');
}

async function writeManifest(languages: unknown[]): Promise<void> {
  await writeContentFile('manifest.json', JSON.stringify({ languages, schemaVersion: 2 }));
}

const PYTHON_EASY = serializeBank([
  buildMcQuestion('py-mc', 2, 4),
  buildAbQuestion('py-ab', 1),
  buildBoolQuestion('py-bool-true', true),
  buildBoolQuestion('py-bool-false', false),
  // Dropped by validateQuestionBank: answerIndex is outside the choices.
  buildMcQuestion('py-dropped', 7, 3),
]);

const POSTGRES_EASY = serializeBank([buildMcQuestion('pg-mc', 0, 3)]);

async function writeValidContentDir(): Promise<void> {
  await writeContentFile('python/easy.json', PYTHON_EASY);
  await writeContentFile('postgres/easy.json', POSTGRES_EASY);
  await writeManifest([
    buildLanguage('python', 'python', {
      easy: buildBankEntry('python/easy.json', sha256Hex(PYTHON_EASY), 'free'),
      // Listed but absent from this checkout, like a paid bank in a public clone.
      medium: buildBankEntry('python/medium.json', sha256Hex('absent'), 'paid', 'syntactical.python.medium'),
    }),
    buildLanguage('postgres', 'sql', {
      easy: buildBankEntry('postgres/easy.json', sha256Hex(POSTGRES_EASY), 'free'),
    }),
  ]);
}

beforeEach(async () => {
  contentDir = await mkdtemp(join(tmpdir(), 'read-server-manifest-'));
});

afterEach(async () => {
  await rm(contentDir, { force: true, recursive: true });
});

describe('readServerManifest', () => {
  it('maps each present bank, keyed language/difficulty, to its mc and ab answers', async () => {
    await writeValidContentDir();

    const answerKey = await readServerManifest(contentDir);

    expect([...answerKey.keys()].sort()).toEqual(['postgres/easy', 'python/easy']);
    const pythonEasy = answerKey.get('python/easy');
    expect(pythonEasy?.get('py-mc')).toEqual({ answerIndex: 2, choiceCount: 4 });
    expect(pythonEasy?.get('py-ab')).toEqual({ answerIndex: 1, choiceCount: 2 });
    expect(answerKey.get('postgres/easy')?.get('pg-mc')).toEqual({ answerIndex: 0, choiceCount: 3 });
  });

  it('maps a bool question to two choices with True as choice 0 and False as choice 1', async () => {
    await writeValidContentDir();

    const pythonEasy = (await readServerManifest(contentDir)).get('python/easy');

    expect(pythonEasy?.get('py-bool-true')).toEqual({ answerIndex: 0, choiceCount: 2 });
    expect(pythonEasy?.get('py-bool-false')).toEqual({ answerIndex: 1, choiceCount: 2 });
  });

  it('skips a manifest bank whose file is missing instead of failing', async () => {
    await writeValidContentDir();

    const answerKey = await readServerManifest(contentDir);

    expect(answerKey.has('python/medium')).toBe(false);
    expect(answerKey.get('python/easy')?.size).toBe(4);
  });

  it('leaves out a question that validateQuestionBank drops', async () => {
    await writeValidContentDir();

    const pythonEasy = (await readServerManifest(contentDir)).get('python/easy');

    expect(pythonEasy?.has('py-dropped')).toBe(false);
    expect([...(pythonEasy?.keys() ?? [])].sort()).toEqual(['py-ab', 'py-bool-false', 'py-bool-true', 'py-mc']);
  });

  it('rejects when a bank file hash does not match the manifest entry', async () => {
    await writeContentFile('python/easy.json', PYTHON_EASY);
    const tamperedHash = sha256Hex(`${PYTHON_EASY}\n`);
    await writeManifest([
      buildLanguage('python', 'python', {
        easy: buildBankEntry('python/easy.json', tamperedHash, 'free'),
      }),
    ]);

    await expect(readServerManifest(contentDir)).rejects.toThrow();
  });

  it('rejects an invalid manifest', async () => {
    await writeContentFile('python/easy.json', PYTHON_EASY);
    await writeContentFile(
      'manifest.json',
      JSON.stringify({
        languages: [
          buildLanguage('python', 'python', {
            easy: buildBankEntry('python/easy.json', sha256Hex(PYTHON_EASY), 'free'),
          }),
        ],
        schemaVersion: 99,
      }),
    );

    await expect(readServerManifest(contentDir)).rejects.toThrow();
  });
});
