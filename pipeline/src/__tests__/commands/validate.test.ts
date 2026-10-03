// B-13: `pipeline validate` writes a pipeline report listing every question as
// passed, failed (with reason), or not-executable, and changes no content file.
// The validator and oracle source are fakes; no Docker runs here.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateContent } from '../../commands/validate.js';
import type { Oracle } from '../../types/Oracle.js';
import type { PipelineReport } from '../../types/PipelineReport.js';
import type { ValidationResult } from '../../types/ValidationResult.js';

const SECRET_PROMPT = 'PROMPT-SECRET-zebra';
const SECRET_CODE = 'CODE-SECRET-walrus';
const SECRET_CHOICE = 'CHOICE-SECRET-otter';
const PAID_PROMPT = 'PAID-PROMPT-heron';

const ORACLE: Oracle = { code: 'print(1)', language: 'python' };

function buildQuestion(id: string, prompt: string): Record<string, unknown> {
    return {
        answerIndex: 0,
        choices: [SECRET_CHOICE, 'other'],
        code: SECRET_CODE,
        id,
        prompt,
        type: 'mc',
    };
}

function buildEntry(path: string, access: 'free' | 'paid'): Record<string, unknown> {
    return { access, contentVersion: 1, hash: 'h', path, topicCounts: {} };
}

const MANIFEST = {
    languages: [
        {
            banks: {
                easy: buildEntry('python/easy.json', 'free'),
                medium: buildEntry('python/medium.json', 'paid'),
            },
            id: 'python',
        },
    ],
    schemaVersion: 2,
};

const FILES: Record<string, unknown> = {
    'manifest.json': MANIFEST,
    'python/easy.json': {
        questions: [
            buildQuestion('p-1', SECRET_PROMPT),
            buildQuestion('p-2', SECRET_PROMPT),
            buildQuestion('p-3', SECRET_PROMPT),
        ],
    },
    'python/medium.json': { questions: [buildQuestion('paid-1', PAID_PROMPT)] },
};

const RESULTS: Record<string, ValidationResult> = {
    'p-1': { runtimeVersion: 'Python 3.13.16', status: 'passed' },
    'p-2': { reason: 'answer-mismatch', status: 'failed' },
    'p-3': { status: 'not-executable' },
    'paid-1': { status: 'passed' },
};

async function snapshot(dir: string): Promise<Record<string, string>> {
    const names = (await readdir(dir, { recursive: true })).sort();
    const entries: Record<string, string> = {};
    for (const name of names) {
        if (name.endsWith('.json')) {
            entries[name] = await readFile(join(dir, name), 'utf8');
        }
    }
    return entries;
}

describe('validateContent', () => {
    let root: string;
    let contentDir: string;
    let reportsDir: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'validate-'));
        contentDir = join(root, 'content');
        reportsDir = join(root, 'reports');
        await mkdir(join(contentDir, 'python'), { recursive: true });
        for (const [name, value] of Object.entries(FILES)) {
            await writeFile(join(contentDir, name), JSON.stringify(value));
        }
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    const seenOracles = new Map<string, Oracle | null>();

    async function run(oracleFor: (id: string) => Oracle | null): Promise<PipelineReport> {
        const times = ['2026-10-03T10:00:00.000Z', '2026-10-03T10:00:05.000Z'];
        return validateContent({
            contentDir,
            newRunId: () => 'run-1',
            now: () => times.shift() ?? 'exhausted',
            oracleSource: async (_bankKey, id) => oracleFor(id),
            reportsDir,
            validate: async (question, oracle) => {
                seenOracles.set(question.id, oracle);
                return RESULTS[question.id] as ValidationResult;
            },
        });
    }

    it('reports each status with its reason and counts them', async () => {
        const report = await run((id) => (id === 'p-3' ? null : ORACLE));

        expect(seenOracles.get('p-3')).toBeNull();
        expect(seenOracles.get('p-1')).toEqual(ORACLE);

        expect(report.counts).toEqual({ failed: 1, 'not-executable': 1, passed: 2 });
        expect(report.questions).toEqual([
            { bankKey: 'python/easy', id: 'p-1', runtimeVersion: 'Python 3.13.16', status: 'passed' },
            { bankKey: 'python/easy', id: 'p-2', reason: 'answer-mismatch', status: 'failed' },
            { bankKey: 'python/easy', id: 'p-3', status: 'not-executable' },
            { bankKey: 'python/medium', id: 'paid-1', status: 'passed' },
        ]);
    });

    it('takes runId and timestamps from the injected functions', async () => {
        const report = await run(() => ORACLE);

        expect(report).toMatchObject({
            finishedAt: '2026-10-03T10:00:05.000Z',
            runId: 'run-1',
            stage: 'validate',
            startedAt: '2026-10-03T10:00:00.000Z',
        });
    });

    it('leaves every content file byte-identical', async () => {
        const before = await snapshot(contentDir);

        await run(() => ORACLE);

        expect(await snapshot(contentDir)).toEqual(before);
    });

    it('writes the stage file and an identical latest.json', async () => {
        await run(() => ORACLE);

        const stage = await readFile(join(reportsDir, 'validate-run-1.json'), 'utf8');
        expect(await readFile(join(reportsDir, 'latest.json'), 'utf8')).toBe(stage);
    });

    it('never copies prompts, code, or choice text, paid bank included', async () => {
        await run(() => ORACLE);

        const text = await readFile(join(reportsDir, 'latest.json'), 'utf8');
        for (const secret of [SECRET_PROMPT, SECRET_CODE, SECRET_CHOICE, PAID_PROMPT]) {
            expect(text).not.toContain(secret);
        }
        expect(text).toContain('paid-1');
    });
});
