// Loads every bank's validated questions from the content directory's manifest and bank files,
// checked against the manifest hash. Paid banks come only from the paid content directory; with
// none given they are skipped, and a paid bank missing from a given directory refuses to load.
import { buildBankContext, validateQuestionBank } from '@syntactical/content-schema';
import type { BankEntry, LanguageEntry, Question } from '@syntactical/content-schema';

import type { QuestionIndex } from '../types/QuestionIndex.js';

import { assertPaidDirSeparate } from './assertPaidDirSeparate.js';
import { readBankBytes } from './readBankBytes.js';
import { readManifest } from './readManifest.js';
import { sha256 } from './sha256.js';

async function readBank(
  root: string,
  language: LanguageEntry,
  entry: BankEntry,
  forbiddenDir?: string,
): Promise<Map<string, Question> | null> {
  const { hash, path } = entry;
  const bytes = await readBankBytes(root, entry, forbiddenDir);
  if (bytes === null) return null;
  if (sha256(bytes).toString('hex') !== hash) {
    throw new Error(`Bank hash mismatch: ${path}`);
  }
  const validation = validateQuestionBank(JSON.parse(bytes.toString('utf8')) as unknown, buildBankContext(language));
  if ('rule' in validation) throw new Error(`Invalid bank ${path}: ${validation.rule}`);
  const { questions } = validation;
  return new Map(questions.map((question) => [question.id, question]));
}

// The directory a bank is read from, or null for a paid bank when no paid directory is given.
function pickRoot(entry: BankEntry, contentDir: string, paidContentDir?: string): string | null {
  return entry.access === 'paid' ? (paidContentDir ?? null) : contentDir;
}

async function readServerQuestions(contentDir: string, paidContentDir?: string): Promise<QuestionIndex> {
  if (paidContentDir !== undefined) await assertPaidDirSeparate(contentDir, paidContentDir);
  const manifest = await readManifest(contentDir);
  const index = new Map<string, ReadonlyMap<string, Question>>();
  for (const language of manifest.languages) {
    const { banks, id } = language;
    for (const [difficulty, entry] of Object.entries(banks)) {
      const root = pickRoot(entry, contentDir, paidContentDir);
      if (root === null) continue;
      const { access, path } = entry;
      const isPaid = access === 'paid';
      const bank = await readBank(root, language, entry, isPaid ? contentDir : undefined);
      if (bank) index.set(`${id}/${difficulty}`, bank);
      else if (isPaid) throw new Error(`Paid bank missing: ${path}`);
    }
  }
  return index;
}

export { readServerQuestions };
