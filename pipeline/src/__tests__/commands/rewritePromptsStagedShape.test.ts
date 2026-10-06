// rewrite-prompts checks every staged file's shape before its first model call, so a malformed
// file stops the run before any bank is rewritten, and the error names the file.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rewritePrompts } from '../../commands/rewritePrompts.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);

async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

const STAGED_CARD = {
    answerIndex: 0,
    choices: [
        { text: 'answer-1' },
        { rationale: 'r', text: 'b' },
        { rationale: 'r', text: 'c' },
        { rationale: 'r', text: 'd' },
    ],
    code: 'print(1)',
    id: 'e1',
    prompt: 'Leaky prompt that explains the rule?',
    provenance: { isHumanReviewed: false, source: 'generated', validation: { method: 'executed', status: 'passed' } },
    query: { explanation: 'e', title: 't' },
    topic: 'strings',
    type: 'mc',
};

function language(id: string) {
    return {
        banks: { easy: { access: 'free', contentVersion: 1, hash: HASH, path: `${id}/easy.json`, topicCounts: {} } },
        glyph: 'XX',
        grammar: 'python',
        id,
        label: id,
        misconceptions: [],
        tagline: 'T',
        topics: [{ id: 'strings', label: 'Strings' }],
    };
}

describe('rewritePrompts staged file shape', () => {
    let root: string;
    let contentDir: string;
    let pipelineDir: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'rewrite-shape-'));
        contentDir = join(root, 'repo/content');
        pipelineDir = join(root, 'repo/pipeline');
        await writeJson(join(contentDir, 'manifest.json'), {
            languages: [language('python'), language('ruby')],
            schemaVersion: 2,
        });
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it.each([
        ['has no questions array', { schemaVersion: 2 }],
        ['holds a question without an id', { questions: [{ prompt: 'x', type: 'mc' }], schemaVersion: 2 }],
    ])('stops before any model call when a later staged file %s', async (_label, malformed) => {
        const goodFile = join(pipelineDir, 'generated/python/easy.json');
        await writeJson(goodFile, { questions: [STAGED_CARD], schemaVersion: 2 });
        await writeJson(join(pipelineDir, 'generated/ruby/easy.json'), malformed);
        const before = await readFile(goodFile, 'utf8');
        let calls = 0;
        const provider = {
            async generate() {
                calls += 1;
                return { model: 'fake-model', value: { prompts: [{ id: 'e1', prompt: 'What is printed?' }] } };
            },
        } as unknown as ModelProvider;
        await expect(
            rewritePrompts({
                contentDir,
                contentRoot: join(root, 'unused'),
                log: () => undefined,
                pipelineDir,
                provider,
            }),
        ).rejects.toThrow(/ruby\/easy\.json/);
        expect(calls).toBe(0);
        expect(await readFile(goodFile, 'utf8')).toBe(before);
    });
});
