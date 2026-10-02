// Finds the first rule a language's topic list breaks, or null.
import { CONTENT_LIMITS } from './contentLimits.js';
import { isRecord } from './isRecord.js';
import { isTextWithin } from './isTextWithin.js';

const TOPIC_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function findTopicsProblem(topics: unknown): string | null {
  if (!Array.isArray(topics)) return 'topics is not a list';
  if (topics.length > CONTENT_LIMITS.maxTopics) return 'topics has too many entries';
  const seenIds = new Set<string>();
  for (const [index, topic] of topics.entries()) {
    const at = `topics[${index}]`;
    if (!isRecord(topic)) return `${at} is not an object`;
    const { id, label } = topic;
    if (typeof id !== 'string' || !TOPIC_ID.test(id) || id.length > CONTENT_LIMITS.referenceIdLength) return `${at}.id is invalid`;
    if (seenIds.has(id)) return `${at}.id is a duplicate`;
    seenIds.add(id);
    if (!isTextWithin(label, CONTENT_LIMITS.displayFieldLength)) return `${at}.label is invalid`;
  }
  return null;
}
