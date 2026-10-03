// Finds the first rule one manifest bank entry breaks, or null.
import { SHA256_HEX } from './SHA256_HEX.js';
import { CONTENT_LIMITS } from './contentLimits.js';
import { isRecord } from './isRecord.js';
import { isSafeBankPath } from './isSafeBankPath.js';

export function findBankEntryProblem(
  bank: unknown,
  productId: string,
  topicIds: readonly string[],
): string | null {
  if (!isRecord(bank)) return 'is not an object';
  const { access, contentVersion, hash, path, topicCounts } = bank;
  if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) return 'hash is invalid';
  if (!isSafeBankPath(path)) return 'path is unsafe';
  if (access === 'paid') {
    if (bank.productId !== productId) return 'productId is invalid';
  } else if (access !== 'free' || 'productId' in bank) {
    return 'access is invalid';
  }
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
