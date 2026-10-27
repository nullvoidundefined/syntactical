// The direct sponsor from sponsor.json under the content base URL, as card content with its dates, or null.
// The file is fetched like a bank and cached on the device without a hash (the manifest does not list it
// and it holds no questions). A non-2xx answer means there is no sponsor and clears the cache; a network
// failure or timeout falls back to the cached copy. A malformed file reads as null. Never throws. The
// dates are not applied here: readLiveSponsor applies them on the day a card reads the sponsor, so a
// sponsor fetched before its end date still shows the house card once that date passes (Review Focus 22).
import { CONTENT_LIMITS, validateSponsor, type Sponsor } from '@syntactical/content-schema';

import { ContentFetchError } from '../../clients/ContentFetchError';
import { fetchContentText } from '../../clients/fetchContentText';
import { logWarning } from '../../clients/logClient';
import { readJson } from '../../clients/readJson';
import { removeStoredKey } from '../../clients/removeStoredKey';
import { writeJson } from '../../clients/writeJson';
import { CONTENT_CACHE_KEYS } from '../../constants/contentCacheKeys';
import { DIRECT_SPONSOR_CALL_TO_ACTION, DIRECT_SPONSOR_PATH } from '../../constants/sponsor';

import type { SponsorContent } from './types/SponsorContent';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readCachedSponsor(): Promise<Sponsor | null> {
  const result = validateSponsor(await readJson<unknown>(CONTENT_CACHE_KEYS.sponsor, null));
  return result.isValid ? result.sponsor : null;
}

async function fetchSponsor(contentBaseUrl: string): Promise<Sponsor | null> {
  let text: string;
  try {
    text = await fetchContentText(new URL(DIRECT_SPONSOR_PATH, contentBaseUrl).toString(), CONTENT_LIMITS.sponsorBytes);
  } catch (err) {
    if (err instanceof ContentFetchError && err.reason === 'status') {
      await removeStoredKey(CONTENT_CACHE_KEYS.sponsor);
      return null;
    }
    logWarning({ err }, 'direct sponsor fetch failed, using the cached copy');
    return readCachedSponsor();
  }
  const result = validateSponsor(parseJson(text));
  if (!result.isValid) {
    logWarning({ rule: result.rule }, 'direct sponsor rejected');
    return null;
  }
  await writeJson(CONTENT_CACHE_KEYS.sponsor, result.sponsor);
  return result.sponsor;
}

function toSponsorContent(sponsor: Sponsor, contentBaseUrl: string): SponsorContent {
  const { body, headline, href, iconPath } = sponsor;
  const content: SponsorContent = {
    body,
    callToAction: DIRECT_SPONSOR_CALL_TO_ACTION,
    headline,
    href,
    source: 'direct',
  };
  return iconPath === undefined ? content : { ...content, iconUri: new URL(iconPath, contentBaseUrl).toString() };
}

export type DirectSponsor = { content: SponsorContent; endsOn: string; startsOn: string };

export async function loadDirectSponsor(contentBaseUrl: string | null): Promise<DirectSponsor | null> {
  if (contentBaseUrl === null) return null;
  const sponsor = await fetchSponsor(contentBaseUrl);
  if (sponsor === null) return null;
  return { content: toSponsorContent(sponsor, contentBaseUrl), endsOn: sponsor.endsOn, startsOn: sponsor.startsOn };
}

// The sponsor's card content on today (YYYY-MM-DD, the device's local date) when today falls within
// startsOn..endsOn, both included; otherwise null.
export function readLiveSponsor(directSponsor: DirectSponsor | null, today: string): SponsorContent | null {
  if (directSponsor === null || today < directSponsor.startsOn || today > directSponsor.endsOn) return null;
  return directSponsor.content;
}
