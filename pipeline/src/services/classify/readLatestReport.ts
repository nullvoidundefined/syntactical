// Reads the previous `latest.json` so a classify run can carry the validate verdicts and
// earlier agreement rates forward instead of erasing them. Missing file: null. A file that
// exists but does not parse as a report throws, so a bad file is never silently replaced.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { PipelineReport } from '../../types/PipelineReport.js';

const reportSchema = z.looseObject({
    agreement: z.record(z.string(), z.number()).optional(),
    counts: z.record(z.string(), z.number()),
    questions: z.array(z.looseObject({ bankKey: z.string(), id: z.string(), status: z.string() })),
});

export async function readLatestReport(reportsDir: string): Promise<PipelineReport | null> {
    let text: string;
    try {
        text = await readFile(join(reportsDir, 'latest.json'), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    return reportSchema.parse(JSON.parse(text)) as unknown as PipelineReport;
}
