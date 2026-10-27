// Validates content/sponsor.json for the content build and the app. Returns the typed sponsor, or the first
// rule it broke. Dates are not compared with today here: an expired sponsor is valid and the app skips it.
import { CONTENT_LIMITS } from './contentLimits.js';
import { isHttpsUrl } from './isHttpsUrl.js';
import { isRecord } from './isRecord.js';
import { isTextWithin } from './isTextWithin.js';
import type { Sponsor } from './types/Sponsor.js';

type SponsorResult = { isValid: true; sponsor: Sponsor } | { isValid: false; rule: string };

const ALLOWED_KEYS: readonly string[] = ['body', 'endsOn', 'headline', 'href', 'iconPath', 'startsOn'];
const ICON_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.(png|webp)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function findSponsorProblem(input: Record<string, unknown>): string | null {
  const unknownKey = Object.keys(input).find((key) => !ALLOWED_KEYS.includes(key));
  if (unknownKey !== undefined) return `${unknownKey} is not allowed`;
  const { body, endsOn, headline, href, iconPath, startsOn } = input;
  if (!isTextWithin(headline, CONTENT_LIMITS.displayFieldLength)) return 'headline is invalid';
  if (!isTextWithin(body, CONTENT_LIMITS.displayFieldLength)) return 'body is invalid';
  if (!isHttpsUrl(href)) return 'href is invalid';
  if (iconPath !== undefined && (typeof iconPath !== 'string' || !ICON_PATH.test(iconPath))) {
    return 'iconPath is invalid';
  }
  if (!isCalendarDate(startsOn)) return 'startsOn is invalid';
  if (!isCalendarDate(endsOn)) return 'endsOn is invalid';
  if (endsOn < startsOn) return 'endsOn is before startsOn';
  return null;
}

export function validateSponsor(input: unknown): SponsorResult {
  if (!isRecord(input)) return { isValid: false, rule: 'root shape is invalid' };
  const rule = findSponsorProblem(input);
  if (rule) return { isValid: false, rule };
  return { isValid: true, sponsor: input as unknown as Sponsor };
}
