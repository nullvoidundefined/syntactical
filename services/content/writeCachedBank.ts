// Persists one bank, with its verified hash, to the on-device content cache, within the bank store's budget.
import type { CachedBank } from '@syntactical/content-schema';

import { writeStoredBank } from './bankStore';

export function writeCachedBank(language: string, difficulty: string, bank: CachedBank): Promise<boolean> {
  return writeStoredBank(language, difficulty, bank);
}
