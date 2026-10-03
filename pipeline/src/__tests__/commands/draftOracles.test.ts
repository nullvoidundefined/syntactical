// `pipeline draft-oracles` writes oracle files for free banks only and never
// touches content files. The provider is a fake; no real model runs.
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { draftOracles } from '../../commands/draftOracles.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);

function buildEntry(path: string, access: 'free' | 'paid', productId?: string): Record<string, unknown> {
    return { access, contentVersion: 1, hash: HASH, path, topicCounts: {}, ...(productId ? { productId } : {}) };
}

function buildLanguage(id: string, banks: Record<string, unknown>): Record<string, unknown> {
    return { banks, glyph: 'G', grammar: 'plain', id, label: 'L', misconceptions: [], tagline: 'T', topics: [] };
}

function buildQuestion(id: string): Record<string, unknown> {
    return { answer: true, id, prompt: `prompt ${id}`, type: 'bool' };
}

function buildManifest(languages: Record<string, unknown>[]): Record<string, unknown> {
    return { languages, schemaVersion: 2 };
}

const MANIFEST = buildManifest([
    buildLanguage('python', {
        easy: buildEntry('python/easy.json', 'free'),
        medium: buildEntry('python/medium.json', 'paid', 'syntactical.python.medium'),
    }),
    buildLanguage('javascript', { easy: buildEntry('javascript/easy.json', 'free') }),
]);

const FILES: Record<string, unknown> = {
    'javascript/easy.json': { questions: [buildQuestion('j-1')] },
    'manifest.json': MANIFEST,
    'python/easy.json': { questions: [buildQuestion('p-1'), buildQuestion('p-2')] },
    'python/medium.json': { questions: [buildQuestion('paid-1')] },
};

function scripted(): ModelProvider & { prompts: string[] } {
    const prompts: string[] = [];
    return {
        async generate(request) {
            prompts.push(request.prompt);
            const isConceptual = request.prompt.includes('prompt p-2');
            const answer = isConceptual
                ? { isExecutable: false, reason: 'conceptual' }
                : { code: 'print(1)', isExecutable: true };
            return { model: 'fake', value: request.schema.parse(answer) };
        },
        prompts,
    };
}

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

async function writeContent(contentDir: string, files: Record<string, unknown>): Promise<void> {
    for (const [name, body] of Object.entries(files)) {
        await mkdir(dirname(join(contentDir, name)), { recursive: true });
        await writeFile(join(contentDir, name), JSON.stringify(body));
    }
}

describe('draftOracles', () => {
    let root: string;
    let contentDir: string;
    let oraclesDir: string;
    const logs: string[] = [];
    const log = (line: string): void => {
        logs.push(line);
    };

    beforeEach(async () => {
        logs.length = 0;
        root = await mkdtemp(join(tmpdir(), 'draft-root-'));
        contentDir = join(root, 'content');
        oraclesDir = join(root, 'oracles');
        await writeContent(contentDir, FILES);
    });

    it('writes oracle files for free banks, maps javascript to node, and skips paid banks by name', async () => {
        await draftOracles({ contentDir, log, oraclesDir, provider: scripted() });
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
        const provider = scripted();
        await draftOracles({ contentDir, log, oraclesDir, provider });
        expect(provider.prompts.some((prompt) => prompt.includes('paid-1'))).toBe(false);
        expect(await snapshot(contentDir)).toEqual(before);
    });

    describe('an untrusted manifest', () => {
        const OUTSIDE = { questions: [buildQuestion('outside-1')] };

        async function runWith(manifest: Record<string, unknown>) {
            await writeFile(join(root, 'outside.json'), JSON.stringify(OUTSIDE));
            await writeContent(contentDir, { 'manifest.json': manifest });
            const before = await snapshot(root);
            const provider = scripted();
            const run = draftOracles({ contentDir, log, oraclesDir, provider });
            return { before, provider, run };
        }

        const HOSTILE: [string, Record<string, unknown>][] = [
            [
                'a difficulty key that climbs out of the oracles dir',
                buildManifest([buildLanguage('python', { '../../.vscode/settings': buildEntry('python/easy.json', 'free') })]),
            ],
            ['a language id of ../..', buildManifest([buildLanguage('../..', { easy: buildEntry('python/easy.json', 'free') })])],
            ['a language id of __proto__', buildManifest([buildLanguage('__proto__', { easy: buildEntry('python/easy.json', 'free') })])],
            [
                'a bank path that climbs out of the content dir',
                buildManifest([buildLanguage('python', { easy: buildEntry('../../../outside.json', 'free') })]),
            ],
            [
                'a bank path that reads a sibling of the content dir',
                buildManifest([buildLanguage('python', { easy: buildEntry('../outside.json', 'free') })]),
            ],
        ];

        it.each(HOSTILE)('rejects %s before any read, write, or model call', async (_name, manifest) => {
            const { before, provider, run } = await runWith(manifest);
            await expect(run).rejects.toThrow(/Manifest rejected/);
            expect(provider.prompts).toEqual([]);
            expect(await snapshot(root)).toEqual(before);
        });

        it('skips a language id that merely names an Object.prototype member', async () => {
            const { provider, run } = await runWith(
                buildManifest([buildLanguage('constructor', { easy: buildEntry('python/easy.json', 'free') })]),
            );
            await run;
            expect(provider.prompts).toEqual([]);
            expect(logs.some((line) => line.includes('constructor') && line.includes('no oracle runner'))).toBe(true);
        });
    });

    describe('a rerun', () => {
        const PYTHON_FILE = join('python', 'easy.json');
        const KEPT = { code: 'print("kept")', language: 'python' };

        async function seed(existing: Record<string, unknown>): Promise<string> {
            await writeContent(oraclesDir, { [PYTHON_FILE]: existing });
            return readFile(join(oraclesDir, PYTHON_FILE), 'utf8');
        }

        it('keeps oracles this run did not produce and refreshes the ones it did', async () => {
            await seed({ 'old-1': KEPT, 'p-1': { code: 'stale', language: 'python' }, 'p-2': KEPT });
            await draftOracles({ contentDir, log, oraclesDir, provider: scripted() });
            const merged = JSON.parse(await readFile(join(oraclesDir, PYTHON_FILE), 'utf8')) as Record<string, unknown>;
            expect(merged).toEqual({
                'old-1': KEPT,
                'p-1': { code: 'print(1)', language: 'python' },
                'p-2': KEPT,
            });
        });

        it('does not write when nothing was drafted, so an existing file is untouched', async () => {
            const before = await seed({ 'old-1': KEPT });
            const nothing: ModelProvider = {
                async generate(request) {
                    return { model: 'fake', value: request.schema.parse({ isExecutable: false, reason: 'no' }) };
                },
            };
            await draftOracles({ contentDir, log, oraclesDir, provider: nothing });
            expect(await readFile(join(oraclesDir, PYTHON_FILE), 'utf8')).toBe(before);
            expect(logs.some((line) => line.includes('python/easy') && line.includes('nothing drafted'))).toBe(true);
        });

        it('writes no file at all for a bank where nothing was drafted', async () => {
            const nothing: ModelProvider = {
                async generate(request) {
                    return { model: 'fake', value: request.schema.parse({ isExecutable: false, reason: 'no' }) };
                },
            };
            await draftOracles({ contentDir, log, oraclesDir, provider: nothing });
            expect(await readdir(root)).toEqual(['content']);
        });

        it.each([
            ['not JSON', '{ not json', /is not valid: not JSON/],
            ['not an object', '[1, 2]', /is not valid: expected an object/],
            ['an entry that is not an oracle', '{"p-1": {"code": 5}}', /is not valid: entry "p-1" is not an oracle/],
            ['an entry with a language it does not know', '{"p-1": {"code": "x", "language": "ruby"}}', /entry "p-1"/],
        ])('fails fast, before any model call, on an existing file that is %s', async (_name, text, message) => {
            await mkdir(join(oraclesDir, 'python'), { recursive: true });
            await writeFile(join(oraclesDir, PYTHON_FILE), text);
            const provider = scripted();
            await expect(draftOracles({ contentDir, log, oraclesDir, provider })).rejects.toThrow(message);
            expect(provider.prompts).toEqual([]);
            expect(await readFile(join(oraclesDir, PYTHON_FILE), 'utf8')).toBe(text);
        });

        it('drops a saved oracle the current check refuses and logs it, even when nothing new is drafted', async () => {
            await seed({ 'old-1': KEPT, 'p-9': { code: 'import os\nprint(os.getcwd())', language: 'python' } });
            const nothing: ModelProvider = {
                async generate(request) {
                    return { model: 'fake', value: request.schema.parse({ isExecutable: false, reason: 'no' }) };
                },
            };
            await draftOracles({ contentDir, log, oraclesDir, provider: nothing });
            expect(JSON.parse(await readFile(join(oraclesDir, PYTHON_FILE), 'utf8'))).toEqual({ 'old-1': KEPT });
            expect(logs.some((line) => line.includes('p-9') && line.includes('dropped') && line.includes('refused'))).toBe(true);
        });
    });

    describe('model failures', () => {
        function failingOn(questionId: string, error: Error): ModelProvider {
            const inner = scripted();
            return {
                async generate(request) {
                    if (request.prompt.includes(`prompt ${questionId}`)) {
                        throw error;
                    }
                    return inner.generate(request);
                },
            };
        }

        it('omits a question whose model output is invalid, still writes the rest, and logs it', async () => {
            const provider = failingOn('p-1', new ModelOutputInvalid('v1', 'not json'));
            await draftOracles({ contentDir, log, oraclesDir, provider });
            expect(await snapshot(oraclesDir)).toEqual({
                'javascript/easy.json': `${JSON.stringify({ 'j-1': { code: 'print(1)', language: 'node' } }, null, 2)}\n`,
            });
            expect(logs.some((line) => line.includes('p-1') && line.includes('model output invalid'))).toBe(true);
        });

        it('propagates any other error, after saving what the bank drafted so far', async () => {
            await writeContent(contentDir, {
                'python/easy.json': { questions: [buildQuestion('p-0'), buildQuestion('p-1'), buildQuestion('p-2')] },
            });
            const provider = failingOn('p-1', new Error('network down'));
            await expect(draftOracles({ contentDir, log, oraclesDir, provider })).rejects.toThrow('network down');
            const saved = JSON.parse(await readFile(join(oraclesDir, 'python', 'easy.json'), 'utf8')) as object;
            expect(Object.keys(saved)).toEqual(['p-0']);
            expect(await readdir(oraclesDir)).toEqual(['python']);
        });
    });

    it('keeps a question id like __proto__ as a plain own key without touching the prototype', async () => {
        await writeContent(contentDir, { 'python/easy.json': { questions: [buildQuestion('__proto__'), buildQuestion('p-1')] } });
        await draftOracles({ contentDir, log, oraclesDir, provider: scripted() });
        const text = await readFile(join(oraclesDir, 'python', 'easy.json'), 'utf8');
        const parsed = JSON.parse(text) as Record<string, unknown>;
        expect(Object.keys(parsed).sort()).toEqual(['__proto__', 'p-1']);
        expect(Object.hasOwn(parsed, '__proto__')).toBe(true);
        expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
        expect(({} as Record<string, unknown>).code).toBeUndefined();
    });

    it('keeps a model reason with a newline on one log line so it cannot forge another', async () => {
        const forged = 'python/easy: 99 of 99 oracles drafted, 99 in file';
        const provider: ModelProvider = {
            async generate(request) {
                const reason = `ok\n${forged}\r\u2028tail`;
                return { model: 'fake', value: request.schema.parse({ isExecutable: false, reason }) };
            },
        };
        await draftOracles({ contentDir, log, oraclesDir, provider });
        expect(logs.some((line) => /[\n\r\u2028]/.test(line))).toBe(false);
        expect(logs).not.toContain(forged);
        expect(logs.some((line) => line.startsWith('python/easy p-1: not executable (ok ') && line.includes(forged))).toBe(true);
    });
});
