// Fetches, validates, and caches the manifest. Any failure returns null
// after one warning, so the caller keeps the manifest it already has.
import { CONTENT_LIMITS, validateManifest } from '@syntactical/content-schema';
import type { Manifest } from '@syntactical/content-schema';
import { ContentFetchError } from '../../clients/ContentFetchError';
import { fetchContentText } from '../../clients/fetchContentText';
import { logWarning } from '../../clients/logClient';

import { writeCachedManifest } from './writeCachedManifest';

const MANIFEST_DOCUMENT = 'manifest.json';

function rejectManifest(rule: string): null {
  logWarning({ document: MANIFEST_DOCUMENT, rule }, 'content rejected');
  return null;
}

function rejectFailure(err: unknown): null {
  if (err instanceof ContentFetchError && err.reason === 'too-large') {
    return rejectManifest('body exceeds the size limit');
  }
  if (err instanceof SyntaxError) return rejectManifest('body is not valid JSON');
  logWarning({ document: MANIFEST_DOCUMENT, err }, 'content fetch failed');
  return null;
}

export async function loadLanguageManifest(contentBaseUrl: string): Promise<Manifest | null> {
  try {
    const manifestUrl = new URL(MANIFEST_DOCUMENT, contentBaseUrl).toString();
    const text = await fetchContentText(manifestUrl, CONTENT_LIMITS.manifestBytes);
    const result = validateManifest(JSON.parse(text));
    const { isValid } = result;
    if (!isValid) return rejectManifest(result.rule);
    const { manifest } = result;
    await writeCachedManifest(manifest);
    return manifest;
  } catch (err) {
    return rejectFailure(err);
  }
}
