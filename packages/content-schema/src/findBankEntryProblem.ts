// Finds the first rule one manifest bank entry breaks, or null. Every bank is free, so the keys that once marked a
// paid bank are rejected by name before any other rule: a stale entry is reported for what is stale.
import { SHA256_HEX } from './SHA256_HEX.js';
import { CONTENT_LIMITS } from './contentLimits.js';
import { isRecord } from './isRecord.js';
import { isSafeBankPath } from './isSafeBankPath.js';

const RETIRED_KEYS = ['access', 'productId'] as const;

export function findBankEntryProblem(bank: unknown, topicIds: readonly string[]): string | null {
  if (!isRecord(bank)) return 'is not an object';
  const retiredKey = RETIRED_KEYS.find((key) => key in bank);
  if (retiredKey !== undefined) return `${retiredKey} is not allowed`;
  const { contentVersion, hash, path, topicCounts } = bank;
  if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) return 'hash is invalid';
  if (!isSafeBankPath(path)) return 'path is unsafe';
  if (!Number.isInteger(contentVersion) || (contentVersion as number) < 1) {
    return 'contentVersion is invalid';
  }
  if (!isRecord(topicCounts)) return 'topicCounts is invalid';
  const listedTopics = new Set(topicIds);
  for (const [topicId, count] of Object.entries(topicCounts)) {
    if (!listedTopics.has(topicId)) return `topicCounts.${topicId} is not a listed topic`;
    if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > CONTENT_LIMITS.maxQuestions) {
      return `topicCounts.${topicId} is invalid`;
    }
  }
  return null;
}
