// Persists one bank, with its verified hash, to the on-device content cache.
import type { CachedBank } from '@syntactical/content-schema';
import { writeJson } from '../../clients/writeJson';

import { buildBankCacheKey } from './buildBankCacheKey';

export function writeCachedBank(
  language: string,
  difficulty: string,
  bank: CachedBank,
): Promise<boolean> {
  return writeJson(buildBankCacheKey(language, difficulty), bank);
}
