// Reads one cached bank with its verified hash as a single entry, so a
// cached bank can never be paired with the wrong hash. Entries that fail to
// parse or validate read as absent, which includes a schema 1 bank.
import { SHA256_HEX, SUPPORTED_SCHEMA_VERSION, validateQuestionBank } from '@syntactical/content-schema';
import type { BankContext, CachedBank } from '@syntactical/content-schema';
import { readJson } from '../../clients/readJson';

import { buildBankCacheKey } from './buildBankCacheKey';

export async function readCachedBank(
  language: string,
  difficulty: string,
  context: BankContext,
): Promise<CachedBank | null> {
  const stored = await readJson<{ hash?: unknown; questions?: unknown } | null>(
    buildBankCacheKey(language, difficulty),
    null,
  );
  if (!stored) return null;
  const { hash, questions } = stored;
  if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) return null;
  const result = validateQuestionBank({ questions, schemaVersion: SUPPORTED_SCHEMA_VERSION }, context);
  const { isValid } = result;
  return isValid ? { hash, questions: result.questions } : null;
}
