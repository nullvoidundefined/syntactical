// Persists one bank, with its verified hash, to the on-device content cache.
import { writeJson } from '../../clients/writeJson';

import { buildBankCacheKey } from './buildBankCacheKey';
import type { CachedBank } from './types/CachedBank';

export function writeCachedBank(
  language: string,
  difficulty: string,
  bank: CachedBank,
): Promise<boolean> {
  return writeJson(buildBankCacheKey(language, difficulty), bank);
}
