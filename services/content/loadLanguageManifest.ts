// Fetches, validates, and caches the manifest. Any failure returns null
// after one warning, so the caller keeps the manifest it already has.
import { fetchContentText } from '../../clients/contentClient';
import { logWarning } from '../../clients/logClient';
import { CONTENT_LIMITS } from '../../constants/appConfig';
import { writeCachedManifest } from './contentCache';
import type { Manifest } from './contentTypes';
import { validateManifest } from './validateManifest';

const MANIFEST_DOCUMENT = 'manifest.json';

function rejectManifest(rule: string): null {
  logWarning({ document: MANIFEST_DOCUMENT, rule }, 'content rejected');
  return null;
}

export async function loadLanguageManifest(contentBaseUrl: string): Promise<Manifest | null> {
  try {
    const manifestUrl = new URL(MANIFEST_DOCUMENT, contentBaseUrl).toString();
    const text = await fetchContentText(manifestUrl, CONTENT_LIMITS.manifestBytes);
    const result = validateManifest(JSON.parse(text));
    if (!result.isValid) return rejectManifest(result.rule);
    await writeCachedManifest(result.manifest);
    return result.manifest;
  } catch (err) {
    return rejectManifest(String(err));
  }
}
