// Persists the manifest to the on-device content cache.
import type { Manifest } from '@syntactical/content-schema';
import { writeJson } from '../../clients/writeJson';
import { CONTENT_CACHE_KEYS } from '../../constants/contentCacheKeys';


export function writeCachedManifest(manifest: Manifest): Promise<boolean> {
  return writeJson(CONTENT_CACHE_KEYS.manifest, manifest);
}
