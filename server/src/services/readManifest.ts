// Reads and validates the content directory's manifest, shared by the answer key and paid bank loaders.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateManifest } from '@syntactical/content-schema';
import type { Manifest } from '@syntactical/content-schema';

async function readManifest(contentDir: string): Promise<Manifest> {
  const manifestText = await readFile(join(contentDir, 'manifest.json'), 'utf8');
  const manifestResult = validateManifest(JSON.parse(manifestText) as unknown);
  if ('rule' in manifestResult) {
    const { rule } = manifestResult;
    throw new Error(`Invalid manifest: ${rule}`);
  }
  const { manifest } = manifestResult;
  return manifest;
}

export { readManifest };
