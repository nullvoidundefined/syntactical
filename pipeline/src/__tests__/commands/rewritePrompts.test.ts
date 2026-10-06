// `pipeline rewrite-prompts`: for each manifest bank with staged generated questions, one model
// call rewrites the mc prompts in `generated/<language>/<difficulty>.json` in place. Free staged
// files live under the pipeline dir, paid ones under the private content root. Banks with nothing
// staged cost no call. Bank files are never written; publish moves the staged cards in.
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rewritePrompts } from '../../commands/rewritePrompts.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);

type Json = Record<string, unknown>;

async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(file: string): Promise<{ questions: Json[] }> {
    return JSON.parse(await readFile(file, 'utf8')) as { questions: Json[] };
}

function staged(id: string): Json {
    return {
        answerIndex: 0,
        choices: [
            { text: `answer-${id}` },
            { rationale: 'r', text: 'b' },
            { rationale: 'r', text: 'c' },
            { rationale: 'r', text: 'd' },
        ],
        code: 'print(1)',
        id,
        prompt: `Leaky prompt for ${id} that explains the rule?`,
        provenance: {
            isHumanReviewed: false,
            source: 'generated',
            validation: { method: 'executed', status: 'passed' },
        },
        query: { explanation: 'e', title: 't' },
        topic: 'strings',
        type: 'mc',
    };
}

function bank(path: string, access: 'free' | 'paid'): Json {
    return {
        access,
        contentVersion: 1,
        hash: HASH,
        path,
        topicCounts: {},
        ...(access === 'paid' ? { productId: `syntactical.${path.replace('/', '.').replace('.json', '')}` } : {}),
    };
}

describe('rewritePrompts command', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'rewrite-prompts-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeJson(join(contentDir, 'manifest.json'), {
            languages: [
                {
                    banks: {
                        easy: bank('python/easy.json', 'free'),
                        hard: bank('python/hard.json', 'paid'),
                        medium: bank('python/medium.json', 'paid'),
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
        });
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('rewrites staged free and paid banks with one call each and skips a bank with nothing staged', async () => {
        await writeJson(join(pipelineDir, 'generated/python/easy.json'), {
            questions: [staged('e1'), staged('e2')],
            schemaVersion: 2,
        });
        await writeJson(join(contentRoot, 'generated/python/medium.json'), {
            questions: [staged('m1')],
            schemaVersion: 2,
        });
        const prompts: string[] = [];
        const provider = {
            async generate(request: { prompt: string }) {
                prompts.push(request.prompt);
                const ids = [...request.prompt.matchAll(/"id":\s*"([em]\d)"/g)].map((match) => match[1]);
                return {
                    model: 'fake-model',
                    value: { prompts: ids.map((id) => ({ id, prompt: `What does ${id} print?` })) },
                };
            },
        } as unknown as ModelProvider;

        await rewritePrompts({ contentDir, contentRoot, log: () => undefined, pipelineDir, provider });

        expect(prompts).toHaveLength(2);
        const easy = await readJson(join(pipelineDir, 'generated/python/easy.json'));
        expect(easy.questions.map((question) => question.prompt)).toEqual([
            'What does e1 print?',
            'What does e2 print?',
        ]);
        expect(easy.questions[0]).toEqual({ ...staged('e1'), prompt: 'What does e1 print?' });
        const medium = await readJson(join(contentRoot, 'generated/python/medium.json'));
        expect(medium.questions.map((question) => question.prompt)).toEqual(['What does m1 print?']);
        await expect(stat(join(contentRoot, 'generated/python/hard.json'))).rejects.toThrow();
        await expect(stat(join(pipelineDir, 'generated/python/medium.json'))).rejects.toThrow();
    });

    it('never sends paid question text when the content root sits inside the repo', async () => {
        const insideRoot = join(root, 'repo/private');
        await mkdir(insideRoot, { recursive: true });
        await writeJson(join(insideRoot, 'generated/python/medium.json'), {
            questions: [staged('m1')],
            schemaVersion: 2,
        });
        let calls = 0;
        const provider = {
            async generate() {
                calls += 1;
                return { model: 'fake-model', value: { prompts: [] } };
            },
        } as unknown as ModelProvider;
        await expect(
            rewritePrompts({ contentDir, contentRoot: insideRoot, log: () => undefined, pipelineDir, provider }),
        ).rejects.toThrow(/content root/);
        expect(calls).toBe(0);
    });
});
