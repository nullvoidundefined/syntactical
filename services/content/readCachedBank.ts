// Reads one cached bank with its verified hash as a single entry, so a
// cached bank can never be paired with the wrong hash. Entries that fail to
// parse or validate read as absent.
import { readJson } from '../../clients/readJson';
import { SUPPORTED_SCHEMA_VERSION } from '../../constants/appConfig';

import { SHA256_HEX } from './SHA256_HEX';
import { buildBankCacheKey } from './buildBankCacheKey';
import type { CachedBank } from './types/CachedBank';
import { validateQuestionBank } from './validateQuestionBank';

export async function readCachedBank(
  language: string,
  difficulty: string,
): Promise<CachedBank | null> {
  const stored = await readJson<{ hash?: unknown; questions?: unknown } | null>(
    buildBankCacheKey(language, difficulty),
    null,
  );
  if (!stored) return null;
  const { hash, questions } = stored;
  if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) return null;
  const result = validateQuestionBank({ questions, schemaVersion: SUPPORTED_SCHEMA_VERSION });
  const { isValid } = result;
  return isValid ? { hash, questions: result.questions } : null;
}
