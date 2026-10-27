// Loads every bank's validated questions from the content directory's manifest and bank files,
// checked against the manifest hash. Every bank the manifest lists is required: a missing one
// refuses to load, so a misconfigured start fails loudly instead of dropping a bank's answers.
import { buildBankContext, validateQuestionBank } from '@syntactical/content-schema';
import type { BankEntry, LanguageEntry, Question } from '@syntactical/content-schema';

import type { QuestionIndex } from '../types/QuestionIndex.js';

import { readBankBytes } from './readBankBytes.js';
import { readManifest } from './readManifest.js';
import { sha256 } from './sha256.js';

async function readBank(contentDir: string, language: LanguageEntry, entry: BankEntry): Promise<Map<string, Question>> {
  const { hash, path } = entry;
  const bytes = await readBankBytes(contentDir, entry);
  if (bytes === null) throw new Error(`Bank missing: ${path}`);
  if (sha256(bytes).toString('hex') !== hash) {
    throw new Error(`Bank hash mismatch: ${path}`);
  }
  const validation = validateQuestionBank(JSON.parse(bytes.toString('utf8')) as unknown, buildBankContext(language));
  if ('rule' in validation) throw new Error(`Invalid bank ${path}: ${validation.rule}`);
  const { questions } = validation;
  return new Map(questions.map((question) => [question.id, question]));
}

async function readServerQuestions(contentDir: string): Promise<QuestionIndex> {
  const manifest = await readManifest(contentDir);
  const index = new Map<string, ReadonlyMap<string, Question>>();
  for (const language of manifest.languages) {
    const { banks, id } = language;
    for (const [difficulty, entry] of Object.entries(banks)) {
      index.set(`${id}/${difficulty}`, await readBank(contentDir, language, entry));
    }
  }
  return index;
}

export { readServerQuestions };
