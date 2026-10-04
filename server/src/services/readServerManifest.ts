// Builds the server's answer key from the content directory's manifest and bank files, so
// answer events can derive isCorrect from choiceIndex and reject unknown banks, questions,
// and out-of-range choices.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildBankContext,
  isSafeBankPath,
  validateManifest,
  validateQuestionBank,
} from '@syntactical/content-schema';
import type { BankEntry, LanguageEntry, Question } from '@syntactical/content-schema';

import type { AnswerKey } from '../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../types/AnswerKeyEntry.js';

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

async function readBankText(contentDir: string, { path }: BankEntry): Promise<string | null> {
  if (!isSafeBankPath(path)) throw new Error(`Unsafe bank path: ${path}`);
  try {
    return await readFile(join(contentDir, path), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function readBank(
  contentDir: string,
  language: LanguageEntry,
  entry: BankEntry,
): Promise<Map<string, AnswerKeyEntry> | null> {
  const { hash, path } = entry;
  const text = await readBankText(contentDir, entry);
  if (text === null) return null;
  if (sha256(text).toString('hex') !== hash) {
    throw new Error(`Bank hash mismatch: ${path}`);
  }
  const validation = validateQuestionBank(JSON.parse(text) as unknown, buildBankContext(language));
  if ('rule' in validation) throw new Error(`Invalid bank ${path}: ${validation.rule}`);
  const { questions } = validation;
  return new Map(questions.map((question) => [question.id, toAnswerKeyEntry(question)]));
}

async function readServerManifest(contentDir: string): Promise<AnswerKey> {
  const manifestText = await readFile(join(contentDir, 'manifest.json'), 'utf8');
  const manifestResult = validateManifest(JSON.parse(manifestText) as unknown);
  if ('rule' in manifestResult) throw new Error(`Invalid manifest: ${manifestResult.rule}`);
  const { manifest } = manifestResult;
  const answerKey = new Map<string, ReadonlyMap<string, AnswerKeyEntry>>();
  for (const language of manifest.languages) {
    const { banks, id } = language;
    for (const [difficulty, entry] of Object.entries(banks)) {
      const bank = await readBank(contentDir, language, entry);
      if (bank) answerKey.set(`${id}/${difficulty}`, bank);
    }
  }
  return answerKey;
}

export { readServerManifest };
