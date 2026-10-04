// True when a value is well-formed judged evidence: 1 to maxEvidenceSources sources, each an
// https URL with a non-blank title and quote, plus a verdict string.
import { CONTENT_LIMITS } from './contentLimits.js';
import { isRecord } from './isRecord.js';

const HTTPS_URL = /^https:\/\/\S+$/;

function isNonBlank(value: unknown, maxLength: number): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isValidSource(source: unknown): boolean {
  if (!isRecord(source)) return false;
  const { quote, title, url } = source;
  return (
    typeof url === 'string' &&
    url.length <= CONTENT_LIMITS.sourceUrlLength &&
    HTTPS_URL.test(url) &&
    isNonBlank(title, CONTENT_LIMITS.displayFieldLength) &&
    isNonBlank(quote, CONTENT_LIMITS.longTextLength)
  );
}

export function isValidEvidence(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { sources, verdict } = value;
  return (
    Array.isArray(sources) &&
    sources.length >= 1 &&
    sources.length <= CONTENT_LIMITS.maxEvidenceSources &&
    sources.every(isValidSource) &&
    typeof verdict === 'string' &&
    verdict.length <= CONTENT_LIMITS.longTextLength
  );
}
