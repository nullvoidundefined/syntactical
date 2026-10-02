// Reads the cached manifest; a missing or invalid entry reads as absent.
import { validateManifest } from '@syntactical/content-schema';
import type { Manifest } from '@syntactical/content-schema';
import { readJson } from '../../clients/readJson';
import { CONTENT_CACHE_KEYS } from '../../constants/contentCacheKeys';


export async function readCachedManifest(): Promise<Manifest | null> {
  const result = validateManifest(await readJson<unknown>(CONTENT_CACHE_KEYS.manifest, null));
  const { isValid } = result;
  if (!isValid) return null;
  const { manifest } = result;
  return manifest;
}
