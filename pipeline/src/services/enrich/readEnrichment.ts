// Reads a bank's existing enrichment staging file so a rerun merges into it instead of
// erasing earlier accepted rationales. Missing file: an empty map. A file that exists but
// does not parse as enrichment throws, so a bad file is never silently replaced.
import { z } from 'zod';

import type { EnrichedRationale } from '../../types/EnrichedRationale.js';
import { readJsonIfPresent } from '../json/readJsonIfPresent.js';

const SCHEMA = z.record(
    z.string(),
    z.array(z.object({ choiceIndex: z.number().int(), misconceptionId: z.string(), rationale: z.string() })),
);

export async function readEnrichment(file: string): Promise<Map<string, EnrichedRationale[]>> {
    const raw = await readJsonIfPresent(file);
    return raw === undefined ? new Map() : new Map(Object.entries(SCHEMA.parse(raw)));
}
