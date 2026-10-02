// Finds the first rule a language's misconception list breaks, or null.
import { CONTENT_LIMITS } from './contentLimits.js';
import { isRecord } from './isRecord.js';
import { isTextWithin } from './isTextWithin.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function findMisconceptionsProblem(misconceptions: unknown, languageId: string): string | null {
  if (!Array.isArray(misconceptions)) return 'misconceptions is not a list';
  const prefix = `${languageId}.`;
  const seenIds = new Set<string>();
  for (const [index, misconception] of misconceptions.entries()) {
    const at = `misconceptions[${index}]`;
    if (!isRecord(misconception)) return `${at} is not an object`;
    const { id, description } = misconception;
    if (typeof id !== 'string' || !id.startsWith(prefix) || !SLUG.test(id.slice(prefix.length))) {
      return `${at}.id is invalid`;
    }
    if (seenIds.has(id)) return `${at}.id is a duplicate`;
    seenIds.add(id);
    if (!isTextWithin(description, CONTENT_LIMITS.misconceptionDescriptionLength)) {
      return `${at}.description is invalid`;
    }
  }
  return null;
}
