// Persists a pipeline report as a stage file plus latest.json.
import { join } from 'node:path';

import type { PipelineReport } from '../types/PipelineReport.js';

import { writeJsonAtomic } from './json/writeJsonAtomic.js';

const UNSAFE_NAME_PART = /[/\\]|\.\./;

function assertSafeName(label: string, value: string): void {
    if (UNSAFE_NAME_PART.test(value)) {
        throw new Error(`Unsafe ${label} for a report file name: ${JSON.stringify(value)}`);
    }
}

// Writes `<stage>-<runId>.json` and `latest.json` (identical bytes) under reportsDir.
export async function writePipelineReport(reportsDir: string, report: PipelineReport): Promise<string> {
    const { runId, stage } = report;
    assertSafeName('runId', runId);
    assertSafeName('stage', stage);
    const stagePath = join(reportsDir, `${stage}-${runId}.json`);
    await writeJsonAtomic(stagePath, report);
    await writeJsonAtomic(join(reportsDir, 'latest.json'), report);
    return stagePath;
}
