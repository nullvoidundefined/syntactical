// True for an https URL with no whitespace, within the source URL length limit.
import { CONTENT_LIMITS } from './contentLimits.js';

const HTTPS_URL = /^https:\/\/\S+$/;

export function isHttpsUrl(value: unknown): boolean {
  return typeof value === 'string' && value.length <= CONTENT_LIMITS.sourceUrlLength && HTTPS_URL.test(value);
}
