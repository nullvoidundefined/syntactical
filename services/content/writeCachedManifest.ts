// Persists the manifest to the on-device content cache.
import { writeJson } from '../../clients/writeJson';
import { CONTENT_CACHE_KEYS } from '../../constants/contentCacheKeys';

import type { Manifest } from './types/Manifest';

export function writeCachedManifest(manifest: Manifest): Promise<boolean> {
  return writeJson(CONTENT_CACHE_KEYS.manifest, manifest);
}
