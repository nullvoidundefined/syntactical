// `pipeline draft-oracles` writes oracle files for free banks only and never
// touches content files. The provider is a fake; no real model runs.
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { draftOracles } from '../../commands/draftOracles.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

function buildEntry(path: string, access: 'free' | 'paid'): Record<string, unknown> {
    return { access, contentVersion: 1, hash: 'h', path, topicCounts: {} };
}

function buildQuestion(id: string): Record<string, unknown> {
    return { answer: true, id, prompt: `prompt ${id}`, type: 'bool' };
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
        { banks: { easy: buildEntry('javascript/easy.json', 'free') }, id: 'javascript' },
    ],
    schemaVersion: 2,
};

const FILES: Record<string, unknown> = {
    'javascript/easy.json': { questions: [buildQuestion('j-1')] },
    'manifest.json': MANIFEST,
    'python/easy.json': { questions: [buildQuestion('p-1'), buildQuestion('p-2')] },
    'python/medium.json': { questions: [buildQuestion('paid-1')] },
};

const provider: ModelProvider = {
    async generate(request) {
        const isConceptual = request.prompt.includes('prompt p-2');
        const answer = isConceptual ? { isExecutable: false, reason: 'conceptual' } : { code: 'print(1)', isExecutable: true };
        return { model: 'fake', value: request.schema.parse(answer) };
    },
};

async function snapshot(dir: string): Promise<Record<string, string>> {
    const names = (await readdir(dir, { recursive: true })).sort();
    const entries: [string, string][] = [];
    for (const name of names) {
        if (name.endsWith('.json')) {
            entries.push([name, await readFile(join(dir, name), 'utf8')]);
        }
    }
    return Object.fromEntries(entries);
}

describe('draftOracles', () => {
    let contentDir: string;
    let oraclesDir: string;
    const logs: string[] = [];

    beforeEach(async () => {
        logs.length = 0;
        contentDir = await mkdtemp(join(tmpdir(), 'draft-content-'));
        oraclesDir = join(await mkdtemp(join(tmpdir(), 'draft-oracles-')), 'oracles');
        for (const [name, body] of Object.entries(FILES)) {
            await mkdir(join(contentDir, name, '..'), { recursive: true });
            await writeFile(join(contentDir, name), JSON.stringify(body));
        }
    });

    it('writes oracle files for free banks, maps javascript to node, and skips paid banks by name', async () => {
        await draftOracles({ contentDir, log: (line) => logs.push(line), oraclesDir, provider });
        const written = await snapshot(oraclesDir);
        expect(Object.keys(written).sort()).toEqual(['javascript/easy.json', 'python/easy.json']);
        expect(JSON.parse(written['python/easy.json'] as string)).toEqual({
            'p-1': { code: 'print(1)', language: 'python' },
        });
        expect(JSON.parse(written['javascript/easy.json'] as string)).toEqual({
            'j-1': { code: 'print(1)', language: 'node' },
        });
        expect(logs).toContain('skipping paid bank python/medium');
        expect(logs.some((line) => line.includes('p-2') && line.includes('not executable'))).toBe(true);
    });

    it('never calls the model for a paid bank and leaves content files byte-identical', async () => {
        const before = await snapshot(contentDir);
        const seen: string[] = [];
        const spy: ModelProvider = {
            generate(request) {
                seen.push(request.prompt);
                return provider.generate(request);
            },
        };
        await draftOracles({ contentDir, log: (line) => logs.push(line), oraclesDir, provider: spy });
        expect(seen.some((prompt) => prompt.includes('paid-1'))).toBe(false);
        expect(await snapshot(contentDir)).toEqual(before);
    });
});
