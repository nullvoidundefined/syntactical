// `pipeline rewrite-prompts`: for each manifest bank with staged generated questions, one model
// call rewrites the mc prompts in `generated/<language>/<difficulty>.json` in place. Staged files live
// under the pipeline dir. Banks with nothing staged cost no call. Bank files are never written; publish moves the staged cards in.
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rewritePrompts } from '../../commands/rewritePrompts.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import { readJson, writeJson } from '../fixtures/jsonFiles.js';
import { buildLanguage, buildManifest, HASH } from '../fixtures/manifest.js';

type Json = Record<string, unknown>;

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

function bank(path: string): Json {
    return { contentVersion: 1, hash: HASH, path, topicCounts: {} };
}

describe('rewritePrompts command', () => {
    let root: string;
    let contentDir: string;
    let pipelineDir: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'rewrite-prompts-'));
        contentDir = join(root, 'repo/content');
        pipelineDir = join(root, 'repo/pipeline');
        await writeJson(
            join(contentDir, 'manifest.json'),
            buildManifest(
                buildLanguage({
                    banks: {
                        easy: bank('python/easy.json'),
                        hard: bank('python/hard.json'),
                        medium: bank('python/medium.json'),
                    },
                    glyph: 'PY',
                    grammar: 'python',
                    label: 'Python',
                    topics: [{ id: 'strings', label: 'Strings' }],
                }),
            ),
        );
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('rewrites staged banks with one call each and skips a bank with nothing staged', async () => {
        await writeJson(join(pipelineDir, 'generated/python/easy.json'), {
            questions: [staged('e1'), staged('e2')],
            schemaVersion: 2,
        });
        await writeJson(join(pipelineDir, 'generated/python/medium.json'), {
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

        await rewritePrompts({ contentDir, log: () => undefined, pipelineDir, provider });

        expect(prompts).toHaveLength(2);
        const easy = await readJson<{ questions: Json[] }>(join(pipelineDir, 'generated/python/easy.json'));
        expect(easy.questions.map((question) => question.prompt)).toEqual([
            'What does e1 print?',
            'What does e2 print?',
        ]);
        expect(easy.questions[0]).toEqual({ ...staged('e1'), prompt: 'What does e1 print?' });
        const medium = await readJson<{ questions: Json[] }>(join(pipelineDir, 'generated/python/medium.json'));
        expect(medium.questions.map((question) => question.prompt)).toEqual(['What does m1 print?']);
        await expect(stat(join(pipelineDir, 'generated/python/hard.json'))).rejects.toThrow();
    });
});
