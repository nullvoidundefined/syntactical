// Persists a pipeline report as a stage file plus latest.json.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { PipelineReport } from '../types/PipelineReport.js';

const JSON_INDENT = 2;

const UNSAFE_NAME_PART = /[/\\]|\.\./;

function assertSafeName(label: string, value: string): void {
    if (UNSAFE_NAME_PART.test(value)) {
        throw new Error(`Unsafe ${label} for a report file name: ${JSON.stringify(value)}`);
    }
}

// Writes to a temp name in the same directory, then renames, so a reader never sees a partial file.
async function writeAtomic(path: string, text: string): Promise<void> {
    const tempPath = `${path}.tmp-${process.pid}`;
    await writeFile(tempPath, text);
    await rename(tempPath, path);
}

// Writes `<stage>-<runId>.json` and `latest.json` (identical bytes) under reportsDir.
export async function writePipelineReport(reportsDir: string, report: PipelineReport): Promise<string> {
    const { runId, stage } = report;
    assertSafeName('runId', runId);
    assertSafeName('stage', stage);
    const text = `${JSON.stringify(report, null, JSON_INDENT)}\n`;
    const stagePath = join(reportsDir, `${stage}-${runId}.json`);
    await mkdir(reportsDir, { recursive: true });
    await writeAtomic(stagePath, text);
    await writeAtomic(join(reportsDir, 'latest.json'), text);
    return stagePath;
}
