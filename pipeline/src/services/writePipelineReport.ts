// Persists a pipeline report as a stage file plus latest.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { PipelineReport } from '../types/PipelineReport.js';

const JSON_INDENT = 2;

// Writes `<stage>-<runId>.json` and `latest.json` (identical bytes) under reportsDir.
export async function writePipelineReport(reportsDir: string, report: PipelineReport): Promise<string> {
    const { runId, stage } = report;
    const text = `${JSON.stringify(report, null, JSON_INDENT)}\n`;
    const stagePath = join(reportsDir, `${stage}-${runId}.json`);
    await mkdir(reportsDir, { recursive: true });
    await writeFile(stagePath, text);
    await writeFile(join(reportsDir, 'latest.json'), text);
    return stagePath;
}
