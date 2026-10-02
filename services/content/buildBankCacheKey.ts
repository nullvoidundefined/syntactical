// The storage key under which one language and difficulty bank is cached.
import { CONTENT_CACHE_KEYS } from '../../constants/contentCacheKeys';

export function buildBankCacheKey(language: string, difficulty: string): string {
  return `${CONTENT_CACHE_KEYS.bankPrefix}${language}.${difficulty}`;
}
