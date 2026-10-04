// The storage key under which one language and difficulty bank is cached: the
// shared key for a free bank, or the owner's own key for a paid bank.
import { CONTENT_CACHE_KEYS } from '../../constants/contentCacheKeys';

export function buildBankCacheKey(language: string, difficulty: string, ownerUserId: string | null = null): string {
  if (ownerUserId !== null) return `${CONTENT_CACHE_KEYS.paidBankPrefix}${ownerUserId}.${language}.${difficulty}`;
  return `${CONTENT_CACHE_KEYS.bankPrefix}${language}.${difficulty}`;
}
