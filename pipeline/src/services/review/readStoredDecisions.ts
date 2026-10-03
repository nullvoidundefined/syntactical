// Reads `review/decisions/<language>-<difficulty>.json`, the file publish consumes. Missing
// file: no decisions. A file that does not match the shape throws rather than being replaced.
import { z } from 'zod';

import type { StoredDecision } from '../../types/review/StoredDecision.js';

import { readOptionalJson } from './readOptionalJson.js';

const storedSchema = z.object({
    decisions: z.record(
        z.string(),
        z.object({
            decision: z.enum(['approve', 'reject']),
            fingerprint: z.string(),
            provenance: z.object({ isHumanReviewed: z.boolean() }),
            reason: z.string().optional(),
        }),
    ),
    schemaVersion: z.literal(1),
});

export async function readStoredDecisions(file: string): Promise<Record<string, StoredDecision>> {
    const raw = await readOptionalJson(file);
    return raw === undefined ? {} : (storedSchema.parse(raw).decisions as Record<string, StoredDecision>);
}
