// True when a query's docs are absent, or 1 to maxDocLinks links, each an https URL with a
// non-blank title.
import { CONTENT_LIMITS } from './contentLimits.js';
import { isHttpsUrl } from './isHttpsUrl.js';
import { isRecord } from './isRecord.js';

function isValidDocLink(link: unknown): boolean {
  if (!isRecord(link)) return false;
  const { title, url } = link;
  return (
    isHttpsUrl(url) &&
    typeof title === 'string' &&
    title.trim().length > 0 &&
    title.length <= CONTENT_LIMITS.displayFieldLength
  );
}

export function areValidDocLinks(docs: unknown): boolean {
  if (docs === undefined) return true;
  return (
    Array.isArray(docs) && docs.length >= 1 && docs.length <= CONTENT_LIMITS.maxDocLinks && docs.every(isValidDocLink)
  );
}
