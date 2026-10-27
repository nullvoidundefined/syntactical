// publish merges the enrichment rationales into staged generated questions, so a bank whose
// generated questions are all enriched publishes with `rationale` on every wrong choice (mc) or
// on the question (bool). The chain test runs gap-fill and publish (no enrich) end to end with fakes:
// batch-generated cards arrive already explained.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gapFill } from '../../commands/gapFill.js';
import { publish } from '../../commands/publish.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import { writeJson } from '../fixtures/jsonFiles.js';
import { buildBankEntry, buildLanguage, buildManifest } from '../fixtures/manifest.js';

const TAG = 'python.truthy-strings';

type Json = Record<string, unknown>;

async function readBank(file: string): Promise<{ questions: Json[] }> {
    return JSON.parse(await readFile(file, 'utf8')) as { questions: Json[] };
}

function generated(id: string, over: Json): Json {
    return {
        id,
        prompt: `Prompt ${id}`,
        provenance: {
            isHumanReviewed: false,
            source: 'generated',
            validation: { method: 'executed', status: 'passed' },
        },
        query: { explanation: 'Because.', title: 'Why' },
        topic: 'strings',
        ...over,
    };
}

function buildPythonManifest(): Json {
    const banks = { easy: buildBankEntry('python/easy.json') };
    const topics = [{ id: 'strings', label: 'Strings' }];
    return buildManifest(buildLanguage({ banks, glyph: 'PY', grammar: 'python', label: 'Python', topics }));
}

describe('publish with generated questions', () => {
    let root: string;
    let contentDir: string;
    let pipelineDir: string;

    async function seed(): Promise<string> {
        await writeJson(join(contentDir, 'manifest.json'), buildPythonManifest());
        await writeJson(join(pipelineDir, 'topics.json'), { python: ['strings'] });
        await writeJson(join(pipelineDir, 'taxonomy/python.json'), [{ description: 'Thinks "0" is falsy', id: TAG }]);
        await writeJson(join(contentDir, 'python/easy.json'), {
            questions: [],
            schemaVersion: 2,
        });
        await writeJson(join(pipelineDir, 'classifications/python/easy.json'), {});
        return pipelineDir;
    }

    function publishNow() {
        return publish({
            buildManifest: async () => undefined,
            contentDir,
            log: () => undefined,
            newRunId: () => 'run-publish',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
        });
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'publish-generated-'));
        contentDir = join(root, 'repo/content');
        pipelineDir = join(root, 'repo/pipeline');
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('publishes a bank whose staged generated questions are all enriched, with rationales on them', async () => {
        const outRoot = await seed();
        await writeJson(join(outRoot, 'generated/python/easy.json'), {
            questions: [
                generated('gen-mc', {
                    answerIndex: 1,
                    choices: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
                    type: 'mc',
                }),
                generated('gen-bool', { answer: true, type: 'bool' }),
            ],
            schemaVersion: 2,
        });
        await writeJson(join(outRoot, 'enrichment/python/easy.json'), {
            'gen-bool': [{ choiceIndex: 0, misconceptionId: TAG, rationale: 'why bool' }],
            'gen-mc': [0, 2].map((choiceIndex) => ({
                choiceIndex,
                misconceptionId: TAG,
                rationale: `why ${choiceIndex}`,
            })),
        });
        const { banks } = await publishNow();
        expect(banks['python/easy']).toMatchObject({ isWritten: true, problems: [], written: 2 });
        const { questions } = await readBank(join(contentDir, 'python/easy.json'));
        expect(questions[0]).toMatchObject({
            choices: [{ rationale: 'why 0', text: 'A' }, { text: 'B' }, { rationale: 'why 2', text: 'C' }],
            id: 'gen-mc',
        });
        expect(questions[1]).toMatchObject({ id: 'gen-bool', rationale: 'why bool' });
    });

    it('refuses a bank whose generated question has no enrichment', async () => {
        const outRoot = await seed();
        await writeJson(join(outRoot, 'generated/python/easy.json'), {
            questions: [generated('gen-bool', { answer: true, type: 'bool' })],
            schemaVersion: 2,
        });
        const { banks } = await publishNow();
        expect(banks['python/easy']).toMatchObject({ isWritten: false });
    });

    it('chain: gap-fill then publish (no enrich) writes a bank with every generated question explained', async () => {
        const outRoot = await seed();
        let requested = 0;
        const drafter = {
            async generate(request: { prompt: string }) {
                const count = Number(/COUNT: (\d+)/.exec(request.prompt)?.[1] ?? 0);
                requested += count;
                const cards = Array.from({ length: count }, (_unused, index) => ({
                    answer: true,
                    oracle: { code: 'print(True)' },
                    prompt: `Chain question number ${requested}-${index}?`,
                    query: { explanation: 'e', title: 't' },
                    rationale: 'The statement holds because the program prints True.',
                    type: 'bool',
                }));
                return { model: 'fake-model', value: { cards } };
            },
        } as unknown as ModelProvider;
        await gapFill({
            contentDir,
            log: () => undefined,
            newRunId: () => 'run-chain',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
            provider: drafter,
            run: async () => ({ outcome: 'value', runtimeVersion: 'Python 3.13.1', value: 'True' }),
        });
        const { banks } = await publishNow();
        expect(banks['python/easy']).toMatchObject({ isWritten: true, problems: [] });
        const { questions } = await readBank(join(contentDir, 'python/easy.json'));
        expect(questions).toHaveLength(10);
        for (const question of questions) {
            expect(question).toMatchObject({ rationale: 'The statement holds because the program prints True.' });
        }
        expect(outRoot).toBe(pipelineDir);
    });
});
