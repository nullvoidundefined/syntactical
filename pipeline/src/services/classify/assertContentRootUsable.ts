// Paid output must never land in the public tree: refuse a content root at or under the
// pipeline dir, the repo root, or the content dir, comparing real paths so a symlink
// cannot smuggle it in. Shared by every stage that writes paid output (classify, enrich).
import { realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { sanitizeLogText } from '../sanitizeLogText.js';

// True when `path` is `base` or lies under it (separator-aware, so `..private` is not `..`).
function isAtOrUnder(path: string, base: string): boolean {
    const rel = relative(base, path);
    return rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

export async function assertContentRootUsable(
    contentRoot: string,
    pipelineDir: string,
    contentDir: string,
): Promise<void> {
    const info = await stat(contentRoot).catch(() => null);
    if (!info?.isDirectory()) {
        throw new Error(`content root not found: ${sanitizeLogText(contentRoot)}`);
    }
    const realRoot = realpathSync.native(contentRoot);
    const publicPlaces = [pipelineDir, resolve(pipelineDir, '..'), contentDir];
    for (const place of publicPlaces) {
        if (isAtOrUnder(realRoot, realpathSync.native(place))) {
            throw new Error('content root must be outside the pipeline directory, the repo, and the content directory');
        }
    }
}
