// Reads the doc link check file (`<pipelineDir>/references/doc-links.json`, URL to its last
// result), which publish consults to keep only confirmed links. Missing file: an empty map.
import { z } from 'zod';

import { readJsonIfPresent } from '../gapFill/readJsonIfPresent.js';

const SCHEMA = z.record(
    z.string(),
    z.object({ checkedAt: z.string(), ok: z.boolean(), reason: z.string().optional() }),
);

export type DocLinkChecks = Map<string, z.infer<typeof SCHEMA>[string]>;

export async function readDocLinkChecks(file: string): Promise<DocLinkChecks> {
    const value = await readJsonIfPresent(file);
    return value === undefined ? new Map() : new Map(Object.entries(SCHEMA.parse(value)));
}
