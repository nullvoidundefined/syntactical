// Builds the server's answer key from the content directory's manifest and bank files, so
// answer events can derive isCorrect from choiceIndex and reject unknown banks, questions,
// and out-of-range choices. Paid banks come only from the paid content directory.
import { buildBankContext, validateQuestionBank } from '@syntactical/content-schema';
import type { BankEntry, LanguageEntry, Question } from '@syntactical/content-schema';

import type { AnswerKey } from '../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../types/AnswerKeyEntry.js';

import { assertPaidDirSeparate } from './assertPaidDirSeparate.js';
import { readBankBytes } from './readBankBytes.js';
import { readManifest } from './readManifest.js';
import { sha256 } from './sha256.js';

type BoolQuestion = Extract<Question, { type: 'bool' }>;

function toBoolEntry({ answer }: BoolQuestion): AnswerKeyEntry {
  return { answerIndex: answer ? 0 : 1, choiceCount: 2 };
}

function toChoiceEntry({ answerIndex, choices }: Exclude<Question, BoolQuestion>): AnswerKeyEntry {
  return { answerIndex, choiceCount: choices.length };
}

function toAnswerKeyEntry(question: Question): AnswerKeyEntry {
  return question.type === 'bool' ? toBoolEntry(question) : toChoiceEntry(question);
}

async function readBank(
  root: string,
  language: LanguageEntry,
  entry: BankEntry,
  forbiddenDir?: string,
): Promise<Map<string, AnswerKeyEntry> | null> {
  const { hash, path } = entry;
  const bytes = await readBankBytes(root, entry, forbiddenDir);
  if (bytes === null) return null;
  if (sha256(bytes).toString('hex') !== hash) {
    throw new Error(`Bank hash mismatch: ${path}`);
  }
  const validation = validateQuestionBank(
    JSON.parse(bytes.toString('utf8')) as unknown,
    buildBankContext(language),
  );
  if ('rule' in validation) throw new Error(`Invalid bank ${path}: ${validation.rule}`);
  const { questions } = validation;
  return new Map(questions.map((question) => [question.id, toAnswerKeyEntry(question)]));
}

// The directory a bank is read from, or null for a paid bank when no paid directory is given.
function pickRoot(entry: BankEntry, contentDir: string, paidContentDir?: string): string | null {
  return entry.access === 'paid' ? (paidContentDir ?? null) : contentDir;
}

async function readServerManifest(contentDir: string, paidContentDir?: string): Promise<AnswerKey> {
  if (paidContentDir !== undefined) await assertPaidDirSeparate(contentDir, paidContentDir);
  const manifest = await readManifest(contentDir);
  const answerKey = new Map<string, ReadonlyMap<string, AnswerKeyEntry>>();
  for (const language of manifest.languages) {
    const { banks, id } = language;
    for (const [difficulty, entry] of Object.entries(banks)) {
      const root = pickRoot(entry, contentDir, paidContentDir);
      if (root === null) continue;
      const forbiddenDir = entry.access === 'paid' ? contentDir : undefined;
      const bank = await readBank(root, language, entry, forbiddenDir);
      if (bank) answerKey.set(`${id}/${difficulty}`, bank);
      else if (entry.access === 'paid') throw new Error(`Paid bank missing: ${entry.path}`);
    }
  }
  return answerKey;
}

export { readServerManifest };
