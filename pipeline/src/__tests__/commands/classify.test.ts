// `pipeline classify` with a fake provider: thresholds, review-queue placement (free vs
// paid), agreement, wtf-overuse, hostile manifest, and no content-file writes.
import { mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { classify } from '../../commands/classify.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);
const TOPIC_LIST = [
    { id: 'strings', label: 'Strings' },
    { id: 'wtf', label: 'WTF' },
];
const PAID_TEXT = 'PAID-SECRET-PROMPT';

function buildEntry(path: string, access: 'free' | 'paid'): Record<string, unknown> {
    const productId = access === 'paid' ? { productId: 'syntactical.python.medium' } : {};
    return {
        access,
        contentVersion: 1,
        hash: HASH,
        path,
        topicCounts: {},
        ...productId,
    };
}

function buildManifest(banks: Record<string, unknown>, topics: unknown[] = TOPIC_LIST): Record<string, unknown> {
    const language = {
        banks,
        glyph: 'G',
        grammar: 'plain',
        id: 'python',
        label: 'L',
        misconceptions: [],
        tagline: 'T',
        topics,
    };
    return { languages: [language], schemaVersion: 2 };
}

function buildQuestion(id: string, prompt: string): Record<string, unknown> {
    return { answer: true, id, prompt, type: 'bool' };
}

type Reply = { confidence: number; topic: string } | 'invalid';

// Calls for one question are consecutive, so the call index tells run 1 from run 2.
function scripted(script: (prompt: string, callIndex: number) => Reply): ModelProvider & { prompts: string[] } {
    const prompts: string[] = [];
    return {
        async generate(request) {
            const reply = script(request.prompt, prompts.length);
            prompts.push(request.prompt);
            if (reply === 'invalid') {
                throw new ModelOutputInvalid(request.promptVersion, 'bad');
            }
            return { model: 'fake', value: request.schema.parse(reply) };
        },
        prompts,
    };
}

async function writeTree(root: string, files: Record<string, unknown>): Promise<void> {
    for (const [name, body] of Object.entries(files)) {
        await mkdir(dirname(join(root, name)), { recursive: true });
        await writeFile(join(root, name), JSON.stringify(body));
    }
}

async function readJson(path: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

async function listFiles(dir: string): Promise<string[]> {
    const names = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
    const files: string[] = [];
    for (const name of names) {
        if (!(await stat(join(dir, name))).isDirectory()) {
            files.push(name);
        }
    }
    return files.sort();
}

describe('classify', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    const logs: string[] = [];
    const log = (line: string): void => {
        logs.push(line);
    };
    let runNumber = 0;

    function run(provider: ModelProvider, overrides: { contentRoot?: string } = {}) {
        runNumber += 1;
        return classify({
            contentDir,
            contentRoot: overrides.contentRoot ?? contentRoot,
            log,
            newRunId: () => `run-${runNumber}`,
            now: () => '2026-10-03T00:00:00.000Z',
            pipelineDir,
            provider,
        });
    }

    async function seed(banks: Record<string, unknown[]>, topics?: unknown[]): Promise<void> {
        const entries: Record<string, unknown> = {};
        const files: Record<string, unknown> = {};
        for (const [name, questions] of Object.entries(banks)) {
            const [difficulty, access] = name.split(':') as [string, 'free' | 'paid'];
            entries[difficulty] = buildEntry(`python/${difficulty}.json`, access);
            files[`python/${difficulty}.json`] = { questions };
        }
        await writeTree(contentDir, {
            ...files,
            'manifest.json': buildManifest(entries, topics),
        });
    }

    beforeEach(async () => {
        logs.length = 0;
        root = await mkdtemp(join(tmpdir(), 'classify-root-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeTree(pipelineDir, {
            'topics.json': { python: ['strings', 'wtf'] },
        });
    });

    it('accepts a confident, agreeing classification and writes no review-queue file', async () => {
        await seed({ 'easy:free': [buildQuestion('q-1', 'p1')] });
        const report = await run(scripted(() => ({ confidence: 0.9, topic: 'strings' })));
        expect(await readJson(join(pipelineDir, 'classifications/python/easy.json'))).toEqual({
            'q-1': { confidence: 0.9, topic: 'strings' },
        });
        expect(await listFiles(join(pipelineDir, 'review-queue'))).toEqual([]);
        expect(report.agreement).toEqual({ classify: 1 });
        expect(report.stage).toBe('classify');
    });

    it('routes confidence 0.6 to pipeline/review-queue for a free bank and assigns no topic', async () => {
        await seed({ 'easy:free': [buildQuestion('q-1', 'p1')] });
        await run(scripted(() => ({ confidence: 0.6, topic: 'strings' })));
        expect(await readJson(join(pipelineDir, 'review-queue/python/easy/q-1.json'))).toEqual({
            bankKey: 'python/easy',
            confidence: 0.6,
            id: 'q-1',
            reason: 'low-confidence',
            suggestedTopic: 'strings',
        });
        expect(await readJson(join(pipelineDir, 'classifications/python/easy.json'))).toEqual({});
    });

    it('accepts exactly 0.7 (the threshold is inclusive)', async () => {
        await seed({ 'easy:free': [buildQuestion('q-1', 'p1')] });
        await run(scripted(() => ({ confidence: 0.7, topic: 'strings' })));
        expect(await listFiles(join(pipelineDir, 'review-queue'))).toEqual([]);
    });

    it('routes a paid-bank question to the content root and never writes paid text under pipeline/', async () => {
        await seed({ 'medium:paid': [buildQuestion('paid-1', PAID_TEXT)] });
        await run(scripted(() => ({ confidence: 0.6, topic: 'wtf' })));
        expect((await readJson(join(contentRoot, 'review-queue/python/medium/paid-1.json'))).id).toBe('paid-1');
        expect(await listFiles(join(pipelineDir, 'review-queue'))).toEqual([]);
        expect(await listFiles(join(pipelineDir, 'classifications'))).toEqual([]);
        const written = [
            ...(await Promise.all(
                (await listFiles(pipelineDir)).map((name) => readFile(join(pipelineDir, name), 'utf8')),
            )),
            ...(await Promise.all(
                (await listFiles(contentRoot)).map((name) => readFile(join(contentRoot, name), 'utf8')),
            )),
        ];
        expect(written.length).toBeGreaterThan(0);
        expect(written.join('')).not.toContain(PAID_TEXT);
    });

    it('never writes a paid marker the model echoes back, in any file, the report, or the log', async () => {
        await seed({ 'medium:paid': [buildQuestion('paid-1', PAID_TEXT), buildQuestion('paid-2', `${PAID_TEXT}-2`)] });
        // The fake echoes the whole prompt (paid text included) as a `reason` and as an invalid-output issue.
        const provider: ModelProvider = {
            async generate(request) {
                if (request.prompt.includes(`${PAID_TEXT}-2`)) {
                    throw new ModelOutputInvalid(request.promptVersion, request.prompt);
                }
                return { model: 'fake', value: { confidence: 0.3, reason: request.prompt, topic: 'strings' } as never };
            },
        };
        const report = await run(provider);
        const everything = [
            JSON.stringify(report),
            logs.join('\n'),
            ...(
                await Promise.all(
                    [pipelineDir, contentRoot].flatMap((dir) =>
                        listFiles(dir).then((names) =>
                            Promise.all(names.map((name) => readFile(join(dir, name), 'utf8'))),
                        ),
                    ),
                )
            ).flat(),
        ].join('\n');
        expect(everything).not.toContain(PAID_TEXT);
        expect((await readJson(join(contentRoot, 'review-queue/python/medium/paid-1.json'))).reason).toBe(
            'low-confidence',
        );
        expect((await readJson(join(contentRoot, 'review-queue/python/medium/paid-2.json'))).reason).toBe(
            'model-output-invalid',
        );
    });

    it('reports agreement 0.75 when two runs disagree on 1 of 4 questions, and queues the disagreement', async () => {
        const questions = ['q-1', 'q-2', 'q-3', 'q-4'].map((id) => buildQuestion(id, `prompt ${id}`));
        await seed({ 'easy:free': questions });
        // Calls 0-1 are q-1, 2-3 q-2, 4-5 q-3: call 5 is q-3's second run.
        const report = await run(
            scripted((_prompt, index) => ({
                confidence: 0.9,
                topic: index === 5 ? 'wtf' : 'strings',
            })),
        );
        expect(report.agreement).toEqual({ classify: 0.75 });
        expect(Object.keys(await readJson(join(pipelineDir, 'classifications/python/easy.json')))).toEqual([
            'q-1',
            'q-2',
            'q-4',
        ]);
        expect((await readJson(join(pipelineDir, 'review-queue/python/easy/q-3.json'))).reason).toBe('disagreement');
        expect((await readJson(join(pipelineDir, 'reports/latest.json'))).agreement).toEqual({ classify: 0.75 });
    });

    it('routes invalid model output to the review queue and leaves it out of the agreement rate', async () => {
        await seed({
            'easy:free': [buildQuestion('q-1', 'a'), buildQuestion('q-2', 'b')],
        });
        const report = await run(
            scripted((prompt) => (prompt.includes('"b"') ? 'invalid' : { confidence: 0.9, topic: 'strings' })),
        );
        expect((await readJson(join(pipelineDir, 'review-queue/python/easy/q-2.json'))).reason).toBe(
            'model-output-invalid',
        );
        expect(report.agreement).toEqual({ classify: 1 });
    });

    it('flags a bank where wtf exceeds 20% and not one at exactly 20%', async () => {
        const ids = ['q-1', 'q-2', 'q-3', 'q-4', 'q-5'];
        await seed({
            'easy:free': ids.map((id) => buildQuestion(id, `prompt ${id}`)),
        });
        const atTwenty = await run(
            scripted((prompt) => ({
                confidence: 0.9,
                topic: prompt.includes('prompt q-1') ? 'wtf' : 'strings',
            })),
        );
        expect(atTwenty.flags).toBeUndefined();
        const overTwenty = await run(
            scripted((prompt) => ({
                confidence: 0.9,
                topic: /prompt q-[12]/.test(prompt) ? 'wtf' : 'strings',
            })),
        );
        expect(overTwenty.flags).toEqual(['python/easy: wtf-overuse']);
    });

    it('uses the manifest topics, and falls back to pipeline/topics.json when the manifest has none', async () => {
        await seed({ 'easy:free': [buildQuestion('q-1', 'p')] }, [{ id: 'iterables', label: 'I' }]);
        const fromManifest = scripted(() => ({
            confidence: 0.9,
            topic: 'iterables',
        }));
        await run(fromManifest);
        expect(fromManifest.prompts[0]).toContain('- iterables');
        expect(fromManifest.prompts[0]).not.toContain('- wtf');
        await seed({ 'easy:free': [buildQuestion('q-1', 'p')] }, []);
        const fromFile = scripted(() => ({ confidence: 0.9, topic: 'wtf' }));
        await run(fromFile);
        expect(fromFile.prompts[0]).toContain('- strings\n- wtf');
    });

    it('carries the validate verdicts and earlier agreement forward in the report', async () => {
        await seed({ 'easy:free': [buildQuestion('q-1', 'p')] });
        const verdict = { bankKey: 'python/easy', id: 'q-1', status: 'passed' };
        await writeTree(pipelineDir, {
            'reports/latest.json': {
                agreement: { validate: 0.5 },
                counts: { passed: 1 },
                questions: [verdict],
            },
        });
        const report = await run(scripted(() => ({ confidence: 0.9, topic: 'strings' })));
        expect(report.questions).toEqual([verdict]);
        expect(report.agreement).toEqual({ classify: 1, validate: 0.5 });
        expect(report.counts).toMatchObject({ 'classify-accepted': 1, passed: 1 });
    });

    it('refuses a manifest with a traversal path before any model call or write', async () => {
        await writeTree(contentDir, {
            'manifest.json': buildManifest({
                easy: buildEntry('../../evil.json', 'free'),
            }),
        });
        const provider = scripted(() => ({ confidence: 0.9, topic: 'strings' }));
        await expect(run(provider)).rejects.toThrow('Manifest rejected');
        expect(provider.prompts).toEqual([]);
        expect(await listFiles(pipelineDir)).toEqual(['topics.json']);
        expect(await listFiles(contentRoot)).toEqual([]);
    });

    it('skips a question whose id is not a safe file name', async () => {
        await seed({ 'easy:free': [buildQuestion('../escape', 'p')] });
        const provider = scripted(() => ({ confidence: 0.1, topic: 'strings' }));
        await run(provider);
        expect(provider.prompts).toEqual([]);
        expect(await listFiles(join(pipelineDir, 'review-queue'))).toEqual([]);
    });

    it('refuses a content root inside the pipeline directory when a paid bank exists', async () => {
        await seed({ 'medium:paid': [buildQuestion('paid-1', PAID_TEXT)] });
        const provider = scripted(() => ({ confidence: 0.1, topic: 'strings' }));
        await mkdir(join(pipelineDir, 'private'), { recursive: true });
        await expect(run(provider, { contentRoot: join(pipelineDir, 'private') })).rejects.toThrow(
            'content root must be outside',
        );
        expect(provider.prompts).toEqual([]);
    });

    it.each([
        ['a symlink pointing into the pipeline dir', 'link'],
        ['the repo root', 'repo'],
        ['the content dir', 'content'],
    ])('refuses a content root that is %s', async (_name, kind) => {
        await seed({ 'medium:paid': [buildQuestion('paid-1', PAID_TEXT)] });
        const inside = join(pipelineDir, 'inside');
        await mkdir(inside, { recursive: true });
        await symlink(inside, join(root, 'link'));
        const target = { content: contentDir, link: join(root, 'link'), repo: join(root, 'repo') }[kind] as string;
        const provider = scripted(() => ({ confidence: 0.9, topic: 'strings' }));
        await expect(run(provider, { contentRoot: target })).rejects.toThrow('content root must be outside');
        expect(provider.prompts).toEqual([]);
    });

    it('accepts a sibling directory literally named ..private (not mistaken for a parent)', async () => {
        await seed({ 'medium:paid': [buildQuestion('paid-1', PAID_TEXT)] });
        const odd = join(root, '..private');
        await mkdir(odd, { recursive: true });
        await run(
            scripted(() => ({ confidence: 0.3, topic: 'strings' })),
            { contentRoot: odd },
        );
        expect(await listFiles(odd)).toContain('review-queue/python/medium/paid-1.json');
    });

    it('refuses a directory named ..private inside the pipeline dir', async () => {
        await seed({ 'medium:paid': [buildQuestion('paid-1', PAID_TEXT)] });
        const odd = join(pipelineDir, '..private');
        await mkdir(odd, { recursive: true });
        const provider = scripted(() => ({ confidence: 0.9, topic: 'strings' }));
        await expect(run(provider, { contentRoot: odd })).rejects.toThrow('content root must be outside');
    });

    it('fails clearly when a paid bank exists and the content root is missing', async () => {
        await seed({ 'medium:paid': [buildQuestion('paid-1', PAID_TEXT)] });
        const provider = scripted(() => ({ confidence: 0.9, topic: 'strings' }));
        await expect(run(provider, { contentRoot: join(root, 'missing') })).rejects.toThrow('content root not found');
        expect(provider.prompts).toEqual([]);
    });

    it('keys review-queue files by bank, so a shared id in two banks cannot overwrite each other', async () => {
        await seed({
            'easy:free': [buildQuestion('q-1', 'easy prompt')],
            'hard:free': [buildQuestion('q-1', 'hard prompt')],
        });
        await run(scripted((prompt) => ({ confidence: prompt.includes('easy prompt') ? 0.9 : 0.3, topic: 'strings' })));
        expect((await readJson(join(pipelineDir, 'review-queue/python/hard/q-1.json'))).reason).toBe('low-confidence');
        expect(Object.keys(await readJson(join(pipelineDir, 'classifications/python/easy.json')))).toEqual(['q-1']);
    });

    it('refuses duplicate ids within a bank, case-insensitively', async () => {
        await seed({ 'easy:free': [buildQuestion('Q-1', 'first'), buildQuestion('q-1', 'second')] });
        const provider = scripted(() => ({ confidence: 0.9, topic: 'strings' }));
        await run(provider);
        expect(provider.prompts).toHaveLength(2);
        expect(Object.keys(await readJson(join(pipelineDir, 'classifications/python/easy.json')))).toEqual(['Q-1']);
        expect(logs.some((line) => line.includes('duplicate question id'))).toBe(true);
    });
});
