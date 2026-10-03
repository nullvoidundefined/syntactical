import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { writePipelineReport } from '../../services/writePipelineReport.js';
import type { PipelineReport } from '../../types/PipelineReport.js';

const REPORT: PipelineReport = {
    counts: { failed: 0, 'not-executable': 0, passed: 1 },
    finishedAt: '2026-10-03T10:00:05.000Z',
    questions: [{ bankKey: 'python/easy', id: 'p-1', status: 'passed' }],
    runId: 'run-7',
    stage: 'validate',
    startedAt: '2026-10-03T10:00:00.000Z',
};

let reportsDir: string;

beforeEach(async () => {
    reportsDir = join(await mkdtemp(join(tmpdir(), 'reports-')), 'nested', 'reports');
});

afterEach(async () => {
    await rm(join(reportsDir, '..', '..'), { force: true, recursive: true });
});

it('creates the reports directory and writes <stage>-<runId>.json and latest.json', async () => {
    const path = await writePipelineReport(reportsDir, REPORT);

    expect(path).toBe(join(reportsDir, 'validate-run-7.json'));
    expect((await readdir(reportsDir)).sort()).toEqual(['latest.json', 'validate-run-7.json']);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(REPORT);
});

it('makes latest.json byte-identical to the stage file', async () => {
    const path = await writePipelineReport(reportsDir, REPORT);

    expect(await readFile(join(reportsDir, 'latest.json'), 'utf8')).toBe(await readFile(path, 'utf8'));
});

it('points latest.json at the newest run while keeping older stage files', async () => {
    await writePipelineReport(reportsDir, REPORT);
    await writePipelineReport(reportsDir, { ...REPORT, runId: 'run-8' });

    const latest = JSON.parse(await readFile(join(reportsDir, 'latest.json'), 'utf8')) as PipelineReport;
    expect(latest.runId).toBe('run-8');
    expect(await readdir(reportsDir)).toContain('validate-run-7.json');
});

it('rejects a runId containing a path separator or dot-dot, writing nothing', async () => {
    for (const runId of ['../escape', 'a/b', 'a\\b', '..']) {
        await expect(writePipelineReport(reportsDir, { ...REPORT, runId })).rejects.toThrow(/runId/);
    }
    await expect(readdir(reportsDir)).rejects.toThrow();
});

it('rejects a stage containing a path separator or dot-dot', async () => {
    for (const stage of ['../x', 'a/b', 'a\\b', '..']) {
        await expect(writePipelineReport(reportsDir, { ...REPORT, stage })).rejects.toThrow(/stage/);
    }
});

it('leaves no temp files behind after a write', async () => {
    await writePipelineReport(reportsDir, REPORT);

    expect((await readdir(reportsDir)).filter((name) => name.includes('.tmp'))).toEqual([]);
});
