// `pipeline gap-fill` with a fake provider and a fake runOracle: how many questions each topic
// requests, where the staging files land (free under pipeline/, paid under the content root),
// and that content bank files are never written. No Docker, no real model.
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { gapFill } from '../../commands/gapFill.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';

const HASH = '0123456789abcdef'.repeat(4);
const TOPICS = [
    { id: 'strings', label: 'Strings' },
    { id: 'lists', label: 'Lists' },
];
const READ_ONLY_MODE = 0o555;
const PAID_MARKER = 'PAID-BANK-MARKER';

function buildEntry(path: string, access: 'free' | 'paid'): Record<string, unknown> {
    const productId = access === 'paid' ? { productId: 'syntactical.python.medium' } : {};
    return { access, contentVersion: 1, hash: HASH, path, topicCounts: {}, ...productId };
}

function buildManifest(banks: Record<string, unknown>): Record<string, unknown> {
    return {
        languages: [
            {
                banks,
                glyph: 'G',
                grammar: 'plain',
                id: 'python',
                label: 'L',
                misconceptions: [],
                tagline: 'T',
                topics: TOPICS,
            },
        ],
        schemaVersion: 2,
    };
}

function buildBankQuestion(id: string, prompt = `Existing ${id}`): Record<string, unknown> {
    return { answer: true, id, prompt, type: 'bool' };
}

async function writeJson(path: string, body: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(body));
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

// Each call drafts a new question for the topic named in the prompt; the answer matches the fake run.
function counting(): ModelProvider & { requestedTopics: string[] } {
    const requestedTopics: string[] = [];
    return {
        async generate(request) {
            const topic = /TOPIC: (\S+)/.exec(request.prompt)?.[1] ?? 'none';
            requestedTopics.push(topic);
            const draft = {
                question: {
                    answer: true,
                    oracle: { code: 'print(True)' },
                    prompt: `Generated ${requestedTopics.length} about ${PAID_MARKER}-${topic}?`,
                    query: { explanation: 'e', title: 't' },
                    type: 'bool',
                },
            };
            return { model: 'fake-model', value: request.schema.parse(draft) };
        },
        requestedTopics,
    } as ModelProvider & { requestedTopics: string[] };
}

describe('gapFill', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    const logs: string[] = [];
    const ranOracles: Oracle[] = [];
    let runNumber = 0;

    function run(provider: ModelProvider) {
        runNumber += 1;
        return gapFill({
            contentDir,
            contentRoot,
            log: (line) => logs.push(line),
            newRunId: () => `run-${runNumber}`,
            now: () => '2026-10-03T00:00:00.000Z',
            pipelineDir,
            provider,
            run: async (oracle) => {
                ranOracles.push(oracle);
                return { outcome: 'value', runtimeVersion: '3.12.1', value: 'True' };
            },
        });
    }

    // `bank` maps "<difficulty>:<access>" to the topic of each existing question.
    async function seed(bank: Record<string, string[]>): Promise<void> {
        const entries: Record<string, unknown> = {};
        for (const [name, topics] of Object.entries(bank)) {
            const [difficulty, access] = name.split(':') as [string, 'free' | 'paid'];
            entries[difficulty] = buildEntry(`python/${difficulty}.json`, access);
            const questions = topics.map((_topic, index) => buildBankQuestion(`${difficulty}-${index}`));
            await writeJson(join(contentDir, `python/${difficulty}.json`), { questions });
            const accepted = Object.fromEntries(
                topics.map((topic, index) => [`${difficulty}-${index}`, { confidence: 0.9, topic }]),
            );
            const outRoot = access === 'free' ? pipelineDir : contentRoot;
            await writeJson(join(outRoot, `classifications/python/${difficulty}.json`), accepted);
        }
        await writeJson(join(contentDir, 'manifest.json'), buildManifest(entries));
    }

    beforeEach(async () => {
        logs.length = 0;
        ranOracles.length = 0;
        root = await mkdtemp(join(tmpdir(), 'gapfill-root-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeJson(join(pipelineDir, 'topics.json'), { python: ['strings', 'lists'] });
    });

    it('requests exactly the shortfall for a thin topic and nothing for a full one', async () => {
        await seed({ 'easy:free': [...Array(7).fill('strings'), ...Array(10).fill('lists')] });
        const provider = counting();
        await run(provider);
        expect(provider.requestedTopics).toEqual(['strings', 'strings', 'strings']);
        const staged = await readJson(join(pipelineDir, 'generated/python/easy.json'));
        expect(staged.questions).toHaveLength(3);
        expect(staged.schemaVersion).toBe(2);
    });

    it('counts staged questions toward the target, so a rerun tops up instead of overshooting', async () => {
        await seed({ 'easy:free': [...Array(7).fill('strings'), ...Array(10).fill('lists')] });
        await run(counting());
        const second = counting();
        await run(second);
        expect(second.requestedTopics).toEqual([]);
        const staged = await readJson(join(pipelineDir, 'generated/python/easy.json'));
        expect(staged.questions).toHaveLength(3);
    });

    it('never writes a content bank file or the manifest', async () => {
        await seed({ 'easy:free': Array(7).fill('strings') });
        const before = await Promise.all(
            ['manifest.json', 'python/easy.json'].map((name) => readFile(join(contentDir, name), 'utf8')),
        );
        await run(counting());
        const after = await Promise.all(
            ['manifest.json', 'python/easy.json'].map((name) => readFile(join(contentDir, name), 'utf8')),
        );
        expect(after).toEqual(before);
        expect(await listFiles(contentDir)).toEqual(['manifest.json', 'python/easy.json']);
    });

    it('stages paid-bank questions under the content root and nothing of them under pipeline/', async () => {
        await seed({ 'medium:paid': [...Array(10).fill('lists'), ...Array(9).fill('strings')] });
        await run(counting());
        const staged = await readJson(join(contentRoot, 'generated/python/medium.json'));
        expect(staged.questions).toHaveLength(1);
        for (const name of await listFiles(pipelineDir)) {
            expect(await readFile(join(pipelineDir, name), 'utf8')).not.toContain(PAID_MARKER);
        }
        expect(await listFiles(join(pipelineDir, 'generated'))).toEqual([]);
        expect(logs.join('\n')).not.toContain(PAID_MARKER);
    });

    it('skips a bank with no classification file instead of treating every topic as empty', async () => {
        await seed({ 'easy:free': Array(7).fill('strings') });
        await rm(join(pipelineDir, 'classifications'), { recursive: true });
        const provider = counting();
        await run(provider);
        expect(provider.requestedTopics).toEqual([]);
        expect(logs.join('\n')).toContain('run classify first');
    });

    it('refuses a paid bank when the content root sits inside the repo', async () => {
        await seed({ 'medium:paid': Array(9).fill('strings') });
        contentRoot = join(pipelineDir, 'inside');
        await mkdir(contentRoot, { recursive: true });
        await expect(run(counting())).rejects.toThrow(/content root must be outside/);
    });

    it('runs every generated program through the supplied runner and writes a gap-fill report', async () => {
        await seed({ 'easy:free': [...Array(9).fill('strings'), ...Array(10).fill('lists')] });
        const report = await run(counting());
        expect(ranOracles.length).toBeGreaterThan(0);
        expect(report.stage).toBe('gap-fill');
        expect(report.counts).toMatchObject({ 'gap-fill-duplicate': 0, 'gap-fill-failed': 0, 'gap-fill-generated': 1 });
        const latest = await readJson(join(pipelineDir, 'reports/latest.json'));
        expect(latest.stage).toBe('gap-fill');
    });

    it('reports a draft equal to an existing bank prompt as a duplicate, not a failure, and stages nothing', async () => {
        await seed({ 'easy:free': [...Array(9).fill('strings'), ...Array(10).fill('lists')] });
        const duplicating: ModelProvider = {
            async generate(request) {
                const draft = {
                    question: {
                        answer: true,
                        oracle: { code: 'print(True)' },
                        prompt: '  existing EASY-0!! ',
                        query: { explanation: 'e', title: 't' },
                        type: 'bool',
                    },
                };
                return { model: 'fake-model', value: request.schema.parse(draft) };
            },
        };
        const report = await run(duplicating);
        expect(report.counts['gap-fill-duplicate']).toBe(1);
        expect(report.counts['gap-fill-failed']).toBe(0);
        expect(report.counts['gap-fill-generated']).toBe(0);
        expect(ranOracles).toHaveLength(0);
        expect(await listFiles(join(pipelineDir, 'generated'))).toEqual([]);
    });

    function goodThenThrowing(): ModelProvider {
        let calls = 0;
        return {
            async generate(request) {
                calls += 1;
                if (calls > 1) {
                    throw new Error('transport down');
                }
                const draft = {
                    question: {
                        answer: true,
                        oracle: { code: 'print(True)' },
                        prompt: 'One good generated question?',
                        query: { explanation: 'e', title: 't' },
                        type: 'bool',
                    },
                };
                return { model: 'fake-model', value: request.schema.parse(draft) };
            },
        };
    }

    it('keeps the original error when staging the partial results also fails', async () => {
        await seed({ 'easy:free': [...Array(8).fill('strings'), ...Array(10).fill('lists')] });
        // A read-only staging directory lets the read see no file but makes the write fail.
        const stagingDir = join(pipelineDir, 'generated/python');
        await mkdir(stagingDir, { recursive: true });
        await chmod(stagingDir, READ_ONLY_MODE);
        await expect(run(goodThenThrowing())).rejects.toThrow('transport down');
        expect(logs.join('\n')).toContain('could not stage');
    });

    it('still writes the report with earlier banks counts when a later bank throws', async () => {
        await seed({
            'easy:free': [...Array(9).fill('strings'), ...Array(10).fill('lists')],
            'medium:free': [...Array(9).fill('strings'), ...Array(10).fill('lists')],
        });
        // The first bank's one request succeeds; the second bank's request throws.
        await expect(run(goodThenThrowing())).rejects.toThrow('transport down');
        const latest = await readJson(join(pipelineDir, 'reports/latest.json'));
        expect(latest.stage).toBe('gap-fill');
        expect(latest.counts).toMatchObject({ 'gap-fill-generated': 1 });
    });

    it('reports dropped questions in counts without staging them', async () => {
        await seed({ 'easy:free': [...Array(9).fill('strings'), ...Array(10).fill('lists')] });
        const failing: ModelProvider = {
            async generate(request) {
                const draft = {
                    question: {
                        answer: false,
                        oracle: { code: 'print(True)' },
                        prompt: 'A question that is wrong?',
                        query: { explanation: 'e', title: 't' },
                        type: 'bool',
                    },
                };
                return { model: 'fake-model', value: request.schema.parse(draft) };
            },
        };
        const report = await run(failing);
        expect(report.counts).toMatchObject({ 'gap-fill-failed': 1, 'gap-fill-generated': 0 });
        expect(await listFiles(join(pipelineDir, 'generated'))).toEqual([]);
    });
});
