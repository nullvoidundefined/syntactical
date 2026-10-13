// `pipeline write-references` with fake providers over a copy of the real content: one language
// at a time, every free question gets a saved reference, a rerun pays for none of them again, and
// a reference flagged as revealing the answer is not saved. No model, no network.
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeReferences } from '../../commands/writeReferences.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const REPO_CONTENT = new URL('../../../../content', import.meta.url).pathname;
const REFERENCE = {
    docs: [{ title: 'Built-in types', url: 'https://docs.python.org/3/library/stdtypes.html' }],
    syntax: 'x = 1',
    title: 'Assignment',
};

function provider(revealsAnswer: boolean, calls: string[] = []): ModelProvider {
    return {
        async generate(request) {
            calls.push(request.promptVersion);
            const value =
                request.promptVersion === 'write-reference-v1'
                    ? REFERENCE
                    : { asksForDefinition: false, reason: 'r', revealsAnswer, titleRevealsAnswer: false };
            return { model: 'fake', value: request.schema.parse(value) };
        },
    };
}

describe('writeReferences', () => {
    let workDir: string;
    let contentDir: string;
    let pipelineDir: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'references-'));
        contentDir = join(workDir, 'content');
        pipelineDir = join(workDir, 'pipeline');
        await cp(REPO_CONTENT, contentDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(workDir, { force: true, recursive: true });
    });

    async function questionCount(): Promise<number> {
        const bank = JSON.parse(await readFile(join(contentDir, 'python/easy.json'), 'utf8')) as {
            questions: unknown[];
        };
        return bank.questions.length;
    }

    function run(first: ModelProvider, second: ModelProvider) {
        return writeReferences({
            contentDir,
            languages: ['python'],
            log: () => undefined,
            pipelineDir,
            provider: first,
            secondProvider: second,
        });
    }

    it('saves a reference for every free question of the chosen language and skips them on a rerun', async () => {
        const total = await questionCount();
        const result = await run(provider(false), provider(false));
        expect(result).toEqual({ accepted: total, revealedAnswer: 0, skipped: 0 });
        const saved = JSON.parse(await readFile(join(pipelineDir, 'references/python/easy.json'), 'utf8')) as Record<
            string,
            unknown
        >;
        expect(Object.keys(saved)).toHaveLength(total);
        expect(Object.values(saved)[0]).toEqual(REFERENCE);
        const calls: string[] = [];
        expect(await run(provider(false, calls), provider(false))).toEqual({
            accepted: 0,
            revealedAnswer: 0,
            skipped: 0,
        });
        expect(calls).toEqual([]);
    });

    it('saves nothing for a question whose reference reveals the answer', async () => {
        const total = await questionCount();
        const result = await run(provider(false), provider(true));
        expect(result).toEqual({ accepted: 0, revealedAnswer: total, skipped: 0 });
        await expect(readFile(join(pipelineDir, 'references/python/easy.json'), 'utf8')).rejects.toThrow(/ENOENT/);
    });
});
