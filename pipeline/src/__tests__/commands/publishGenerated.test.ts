// publish merges the enrichment rationales into staged generated questions, so a bank whose
// generated questions are all enriched publishes with `rationale` on every wrong choice (mc) or
// on the question (bool). The chain test runs gap-fill, enrich, and publish end to end with fakes
// for a free and a paid bank: no oracle is lost between the stages.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enrich } from '../../commands/enrich.js';
import { gapFill } from '../../commands/gapFill.js';
import { publish } from '../../commands/publish.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);
const TAG = 'python.truthy-strings';

type Json = Record<string, unknown>;

async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

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

function buildManifest(access: 'free' | 'paid'): Json {
    const productId = access === 'paid' ? { productId: 'syntactical.python.easy' } : {};
    return {
        languages: [
            {
                banks: {
                    easy: {
                        access,
                        contentVersion: 1,
                        hash: HASH,
                        path: 'python/easy.json',
                        topicCounts: {},
                        ...productId,
                    },
                },
                glyph: 'PY',
                grammar: 'python',
                id: 'python',
                label: 'Python',
                misconceptions: [],
                tagline: 'T',
                topics: [{ id: 'strings', label: 'Strings' }],
            },
        ],
        schemaVersion: 2,
    };
}

describe('publish with generated questions', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;

    async function seed(access: 'free' | 'paid'): Promise<string> {
        await writeJson(join(contentDir, 'manifest.json'), buildManifest(access));
        await writeJson(join(pipelineDir, 'topics.json'), { python: ['strings'] });
        await writeJson(join(pipelineDir, 'taxonomy/python.json'), [{ description: 'Thinks "0" is falsy', id: TAG }]);
        const outRoot = access === 'free' ? pipelineDir : contentRoot;
        await writeJson(join(access === 'free' ? contentDir : contentRoot, 'python/easy.json'), {
            questions: [],
            schemaVersion: 2,
        });
        await writeJson(join(outRoot, 'classifications/python/easy.json'), {});
        return outRoot;
    }

    function publishNow() {
        return publish({
            buildManifest: async () => undefined,
            contentDir,
            contentRoot,
            log: () => undefined,
            newRunId: () => 'run-publish',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
        });
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'publish-generated-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it.each<'free' | 'paid'>(['free', 'paid'])(
        'publishes a %s bank whose staged generated questions are all enriched, with rationales on them',
        async (access) => {
            const outRoot = await seed(access);
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
            const { questions } = await readBank(
                join(access === 'free' ? contentDir : contentRoot, 'python/easy.json'),
            );
            expect(questions[0]).toMatchObject({
                choices: [{ rationale: 'why 0', text: 'A' }, { text: 'B' }, { rationale: 'why 2', text: 'C' }],
                id: 'gen-mc',
            });
            expect(questions[1]).toMatchObject({ id: 'gen-bool', rationale: 'why bool' });
        },
    );

    it('refuses a bank whose generated question has no enrichment', async () => {
        const outRoot = await seed('free');
        await writeJson(join(outRoot, 'generated/python/easy.json'), {
            questions: [generated('gen-bool', { answer: true, type: 'bool' })],
            schemaVersion: 2,
        });
        const { banks } = await publishNow();
        expect(banks['python/easy']).toMatchObject({ isWritten: false });
    });

    it.each<'free' | 'paid'>(['free', 'paid'])(
        'chain: gap-fill, enrich, then publish writes a %s bank with every generated question explained',
        async (access) => {
            const outRoot = await seed(access);
            let drafts = 0;
            const drafter = {
                async generate(request: { schema: { parse: (value: unknown) => unknown } }) {
                    drafts += 1;
                    const draft = {
                        question: {
                            answer: true,
                            oracle: { code: 'print(True)' },
                            prompt: `Chain question number ${drafts}?`,
                            query: { explanation: 'e', title: 't' },
                            type: 'bool',
                        },
                    };
                    return { model: 'fake-model', value: request.schema.parse(draft) };
                },
            } as unknown as ModelProvider;
            const enricher = {
                async generate(request: {
                    prompt: string;
                    promptVersion: string;
                    schema: { parse: (v: unknown) => unknown };
                }) {
                    const value =
                        request.promptVersion === 'judge-rationale-v1'
                            ? { isConsistent: true, reason: 'because' }
                            : { rationales: [{ choiceIndex: 0, misconceptionId: TAG, rationale: 'why not' }] };
                    return { model: 'fake', value: request.schema.parse(value) };
                },
            } as unknown as ModelProvider;
            const common = {
                contentDir,
                contentRoot,
                log: () => undefined,
                newRunId: () => 'run-chain',
                now: () => '2026-10-05T00:00:00.000Z',
                pipelineDir,
            };
            await gapFill({
                ...common,
                provider: drafter,
                run: async () => ({ outcome: 'value', runtimeVersion: 'Python 3.13.1', value: 'True' }),
            });
            // The real oracle files stay in place; only the sandbox run is faked.
            await enrich({
                ...common,
                provider: enricher,
                validate: async (_question: unknown, oracle: unknown) =>
                    oracle === null ? { status: 'not-executable' } : { observed: 'True', status: 'passed' },
            } as Parameters<typeof enrich>[0]);
            const { banks } = await publishNow();
            expect(banks['python/easy']).toMatchObject({ isWritten: true, problems: [] });
            const { questions } = await readBank(
                join(access === 'free' ? contentDir : contentRoot, 'python/easy.json'),
            );
            expect(questions).toHaveLength(drafts);
            expect(questions.length).toBeGreaterThan(0);
            for (const question of questions) {
                expect(question).toMatchObject({ rationale: 'why not' });
            }
            expect(outRoot).toBe(access === 'free' ? pipelineDir : contentRoot);
        },
    );
});
