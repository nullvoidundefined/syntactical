// pipeline/src/__tests__/commands/oneContentTree.test.ts
// One content tree: with every bank free, `publish`, `classify`, `validate`, and `write-references` read a Medium
// or Hard bank from content/<track>/<difficulty>.json and keep its staging under pipeline/, as they do for Easy,
// and no command takes a content root. The manifest's bank entries carry no `access`. Fake providers and a fake
// validator; the manifest build is a stub.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SUPPORTED_SCHEMA_VERSION } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { classify } from '../../commands/classify.js';
import { publish } from '../../commands/publish.js';
import { validateContent } from '../../commands/validate.js';
import { writeReferences } from '../../commands/writeReferences.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';
import { readJson, writeJson } from '../fixtures/jsonFiles.js';
import { buildLanguage, HASH } from '../fixtures/manifest.js';

const TAG = 'python.truthy-strings';
const NOW = '2026-10-27T00:00:00.000Z';

type Json = Record<string, unknown>;

function buildEntry(difficulty: string): Json {
    return { contentVersion: 1, hash: HASH, path: `python/${difficulty}.json`, topicCounts: {} };
}

function buildQuestion(id: string): Json {
    return {
        answerIndex: 1,
        choices: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
        id,
        prompt: `Prompt ${id}`,
        provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
        query: { explanation: 'Because.', title: 'Why' },
        type: 'mc',
    };
}

describe('one content tree', () => {
    let root: string;
    let contentDir: string;
    let pipelineDir: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'one-content-tree-'));
        contentDir = join(root, 'repo/content');
        pipelineDir = join(root, 'repo/pipeline');
        const language = buildLanguage({
            banks: { easy: buildEntry('easy'), hard: buildEntry('hard'), medium: buildEntry('medium') },
            glyph: 'PY',
            grammar: 'python',
            label: 'Python',
            topics: [{ id: 'strings', label: 'Strings' }],
        });
        await writeJson(join(contentDir, 'manifest.json'), {
            languages: [language],
            schemaVersion: SUPPORTED_SCHEMA_VERSION,
        });
        for (const [difficulty, id] of [
            ['easy', 'e-1'],
            ['hard', 'h-1'],
            ['medium', 'm-1'],
        ]) {
            await writeJson(join(contentDir, `python/${difficulty}.json`), {
                questions: [buildQuestion(id as string)],
                schemaVersion: 2,
            });
        }
        await writeJson(join(pipelineDir, 'topics.json'), { python: ['strings'] });
        await writeJson(join(pipelineDir, 'taxonomy/python.json'), [{ description: 'Thinks "0" is falsy', id: TAG }]);
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('publish writes a Medium bank to content/python/medium.json from staging under pipeline/', async () => {
        await writeJson(join(pipelineDir, 'reports/latest.json'), {
            counts: {},
            finishedAt: 'f',
            questions: [{ bankKey: 'python/medium', id: 'm-1', runtimeVersion: 'python 3.13', status: 'passed' }],
            runId: 'r',
            stage: 'validate',
            startedAt: 's',
        });
        await writeJson(join(pipelineDir, 'classifications/python/medium.json'), {
            'm-1': { confidence: 0.9, topic: 'strings' },
        });
        await writeJson(join(pipelineDir, 'enrichment/python/medium.json'), {
            'm-1': [0, 2].map((choiceIndex) => ({
                choiceIndex,
                misconceptionId: TAG,
                rationale: `why ${choiceIndex}`,
            })),
        });
        const buildManifest = vi.fn().mockResolvedValue(undefined);

        const { banks } = await publish({
            buildManifest,
            contentDir,
            log: () => undefined,
            newRunId: () => 'run-1',
            now: () => NOW,
            pipelineDir,
        });

        expect(banks['python/medium']).toMatchObject({ isWritten: true });
        const { questions } = await readJson<{ questions: Json[] }>(join(contentDir, 'python/medium.json'));
        expect(questions).toEqual([expect.objectContaining({ id: 'm-1', topic: 'strings' })]);
        expect(buildManifest).toHaveBeenCalledTimes(1);
        expect(buildManifest).toHaveBeenCalledWith();
    });

    it('classify stages a Hard bank under pipeline/classifications', async () => {
        const provider: ModelProvider = {
            async generate(request) {
                return { model: 'fake', value: request.schema.parse({ confidence: 0.9, topic: 'strings' }) };
            },
        };

        await classify({
            contentDir,
            log: () => undefined,
            newRunId: () => 'run-1',
            now: () => NOW,
            pipelineDir,
            provider,
        });

        expect(await readJson(join(pipelineDir, 'classifications/python/hard.json'))).toEqual({
            'h-1': { confidence: 0.9, topic: 'strings' },
        });
    });

    it('validate reads a Medium bank from content/ with its oracle from pipeline/oracles', async () => {
        const oracle: Oracle = { code: 'print(1)', language: 'python' };
        await writeJson(join(pipelineDir, 'oracles/python/medium.json'), { 'm-1': oracle });
        const seen = new Map<string, Oracle | null>();

        const report = await validateContent({
            contentDir,
            newRunId: () => 'run-1',
            now: () => NOW,
            pipelineDir,
            reportsDir: join(pipelineDir, 'reports'),
            validate: async ({ id }, given) => {
                seen.set(id, given);
                return { status: 'passed' };
            },
        });

        expect(seen.get('m-1')).toEqual(oracle);
        expect(report.questions.map(({ bankKey, id }) => `${bankKey} ${id}`)).toEqual([
            'python/easy e-1',
            'python/hard h-1',
            'python/medium m-1',
        ]);
    });

    it('write-references writes a reference for a Medium question under pipeline/references', async () => {
        const reference = {
            docs: [{ title: 'Built-in types', url: 'https://docs.python.org/3/library/stdtypes.html' }],
            syntax: 'x = 1',
            title: 'Assignment',
        };
        const provider: ModelProvider = {
            async generate(request) {
                const value =
                    request.promptVersion === 'write-reference-v2' ? reference : { reason: 'r', revealsAnswer: false };
                return { model: 'fake', value: request.schema.parse(value) };
            },
        };

        const result = await writeReferences({
            contentDir,
            languages: ['python'],
            log: () => undefined,
            pipelineDir,
            provider,
            secondProvider: provider,
        });

        expect(result).toEqual({ accepted: 3, revealedAnswer: 0, skipped: 0 });
        expect(await readJson(join(pipelineDir, 'references/python/medium.json'))).toEqual({ 'm-1': reference });
    });
});
