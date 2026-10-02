// Finds the first rule one manifest bank entry breaks, or null.
import { SHA256_HEX } from './SHA256_HEX.js';
import { isRecord } from './isRecord.js';
import { isSafeBankPath } from './isSafeBankPath.js';

export function findBankEntryProblem(
  bank: unknown,
  productId: string,
  topicIds: readonly string[],
): string | null {
  if (!isRecord(bank)) return 'is not an object';
  if (typeof bank.hash !== 'string' || !SHA256_HEX.test(bank.hash)) return 'hash is invalid';
  if (!isSafeBankPath(bank.path)) return 'path is unsafe';
  if (bank.access === 'paid') {
    if (bank.productId !== productId) return 'productId is invalid';
  } else if (bank.access !== 'free' || 'productId' in bank) {
    return 'access is invalid';
  }
  const { contentVersion, topicCounts } = bank;
  if (!Number.isInteger(contentVersion) || (contentVersion as number) < 1) {
    return 'contentVersion is invalid';
  }
  if (!isRecord(topicCounts)) return 'topicCounts is invalid';
  for (const [topicId, count] of Object.entries(topicCounts)) {
    if (!topicIds.includes(topicId)) return `topicCounts.${topicId} is not a listed topic`;
    if (!Number.isInteger(count) || (count as number) < 0) return `topicCounts.${topicId} is invalid`;
  }
  return null;
}
