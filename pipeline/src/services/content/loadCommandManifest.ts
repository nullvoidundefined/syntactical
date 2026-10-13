// The preamble shared by every command that reads banks: the validated manifest, plus the
// private content root check when any bank is paid (B-60), so paid text never lands in the
// public tree. Commands that only read free banks use loadValidatedManifest directly.
import type { Manifest } from '@syntactical/content-schema';

import { assertContentRootUsable } from '../classify/assertContentRootUsable.js';

import { hasPaidBanks } from './hasPaidBanks.js';
import { loadValidatedManifest } from './loadValidatedManifest.js';

export interface CommandManifestArgs {
    contentDir: string;
    contentRoot: string;
    pipelineDir: string;
}

export async function loadCommandManifest({ contentDir, contentRoot, pipelineDir }: CommandManifestArgs): Promise<Manifest> {
    const manifest = await loadValidatedManifest(contentDir);
    if (hasPaidBanks(manifest)) {
        await assertContentRootUsable(contentRoot, pipelineDir, contentDir);
    }
    return manifest;
}
