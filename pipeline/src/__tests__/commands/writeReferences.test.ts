// `pipeline write-references` with fake providers over a copy of the real content: one language
// at a time, every question of every bank gets a saved reference, a rerun pays for none of them again, and
// a reference flagged as revealing the answer is not saved. No model, no network.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeReferences } from '../../commands/writeReferences.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import { copyOneTrack } from '../fixtures/copyOneTrack.js';

const REPO_CONTENT = new URL('../../../../content', import.meta.url).pathname;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const REFERENCE = {
    docs: [{ title: 'Built-in types', url: 'https://docs.python.org/3/library/stdtypes.html' }],
    syntax: 'x = 1',
    title: 'Assignment',
};

function provider(revealsAnswer: boolean, calls: string[] = []): ModelProvider {
    return {
        async generate(request) {
            calls.push(request.promptVersion);
            const value = request.promptVersion === 'write-reference-v2' ? REFERENCE : { reason: 'r', revealsAnswer };
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
        await copyOneTrack(REPO_CONTENT, contentDir, 'python');
    });

    afterEach(async () => {
        await rm(workDir, { force: true, recursive: true });
    });

    async function questionCount(): Promise<number> {
        let total = 0;
        for (const difficulty of DIFFICULTIES) {
            const bank = JSON.parse(await readFile(join(contentDir, `python/${difficulty}.json`), 'utf8')) as {
                questions: unknown[];
            };
            total += bank.questions.length;
        }
        return total;
    }

    async function readSaved(difficulty: string): Promise<Record<string, unknown>> {
        return JSON.parse(await readFile(join(pipelineDir, `references/python/${difficulty}.json`), 'utf8')) as Record<
            string,
            unknown
        >;
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

    it('saves a reference for every question of the chosen language, all three banks, and skips them on a rerun', async () => {
        const total = await questionCount();
        const result = await run(provider(false), provider(false));
        expect(result).toEqual({ accepted: total, revealedAnswer: 0, skipped: 0 });
        const saved = await Promise.all(DIFFICULTIES.map(readSaved));
        expect(saved.reduce((sum, file) => sum + Object.keys(file).length, 0)).toBe(total);
        expect(Object.values(saved[0] as Record<string, unknown>)[0]).toEqual(REFERENCE);
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
