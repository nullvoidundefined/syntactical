// `pipeline enrich` with a fake provider and a fake validator (no model, no Docker):
// per-choice output, the oracle-contradiction drop, misconception agreement, skipped
// languages and questions, and the free/paid output split.
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ZodError } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';

import { enrich } from '../../commands/enrich.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);
const OBSERVED = 'OBSERVED-OUTPUT-7731';
const PAID_TEXT = 'PAID-SECRET-PROMPT';
const TAGS = ['python.mutable-default-args', 'python.mutable-strings'];
const FIRST_TAG = 'python.mutable-default-args';
const SECOND_TAG = 'python.mutable-strings';

function buildEntry(path: string, access: 'free' | 'paid'): Record<string, unknown> {
    const productId = access === 'paid' ? { productId: 'syntactical.python.medium' } : {};
    return { access, contentVersion: 1, hash: HASH, path, topicCounts: {}, ...productId };
}

function buildManifest(banks: Record<string, unknown>): Record<string, unknown> {
    const language = {
        banks,
        glyph: 'G',
        grammar: 'plain',
        id: 'python',
        label: 'L',
        misconceptions: [],
        tagline: 'T',
        topics: [],
    };
    return { languages: [language], schemaVersion: 2 };
}

function buildMc(id: string, prompt: string): Record<string, unknown> {
    return { answerIndex: 1, choices: [{ text: 'A' }, { text: 'B' }, { text: 'C' }], id, prompt, type: 'mc' };
}

function buildBool(id: string, prompt: string): Record<string, unknown> {
    return { answer: true, id, prompt, type: 'bool' };
}

interface Script {
    // The misconceptionId the nth writeRationales call gives each choice index.
    tag: (callIndex: number, choiceIndex: number) => string;
    // False when the judge should find this rationale text inconsistent.
    isConsistent?: (rationale: string) => boolean;
}

// Applies the request's own schema and maps a schema failure to ModelOutputInvalid, as the
// real provider does after its retries.
function scripted(script: Script): ModelProvider & { prompts: string[]; writes: number } {
    const fake = {
        async generate(request: { prompt: string; promptVersion: string; schema: { parse: (v: unknown) => unknown } }) {
            fake.prompts.push(request.prompt);
            let value: unknown;
            if (request.promptVersion === 'judge-rationale-v1') {
                const text = /<rationale>\n([\s\S]*?)\n<\/rationale>/.exec(request.prompt)?.[1] ?? '';
                value = { isConsistent: script.isConsistent?.(text) ?? true, reason: 'because' };
            } else {
                const wrong = /for each of these choice indexes: ([\d, ]+)\./.exec(request.prompt)?.[1] ?? '';
                const callIndex = fake.writes;
                fake.writes += 1;
                value = {
                    rationales: wrong.split(', ').map((index) => ({
                        choiceIndex: Number(index),
                        misconceptionId: script.tag(callIndex, Number(index)),
                        rationale: `rationale-${index}`,
                    })),
                };
            }
            try {
                return { model: 'fake', value: request.schema.parse(value) };
            } catch (error) {
                if (error instanceof ZodError) {
                    throw new ModelOutputInvalid(request.promptVersion, 'bad');
                }
                throw error;
            }
        },
        prompts: [] as string[],
        writes: 0,
    };
    return fake as unknown as ModelProvider & { prompts: string[]; writes: number };
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

describe('enrich', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    const logs: string[] = [];
    let runNumber = 0;

    function run(provider: ModelProvider, unobservedIds: string[] = [], overrides: { contentRoot?: string } = {}) {
        runNumber += 1;
        return enrich({
            contentDir,
            contentRoot: overrides.contentRoot ?? contentRoot,
            log: (line) => logs.push(line),
            newRunId: () => `run-${runNumber}`,
            now: () => '2026-10-03T00:00:00.000Z',
            oracleSource: async () => null,
            pipelineDir,
            provider,
            validate: async ({ id }) =>
                unobservedIds.includes(id) ? { status: 'not-executable' } : { observed: OBSERVED, status: 'passed' },
        });
    }

    async function seed(banks: Record<string, unknown[]>): Promise<void> {
        const entries: Record<string, unknown> = {};
        const files: Record<string, unknown> = {};
        for (const [name, questions] of Object.entries(banks)) {
            const [difficulty, access] = name.split(':') as [string, 'free' | 'paid'];
            entries[difficulty] = buildEntry(`python/${difficulty}.json`, access);
            files[`python/${difficulty}.json`] = { questions };
        }
        await writeTree(contentDir, { ...files, 'manifest.json': buildManifest(entries) });
    }

    beforeEach(async () => {
        logs.length = 0;
        root = await mkdtemp(join(tmpdir(), 'enrich-root-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeTree(pipelineDir, {
            'taxonomy/python.json': TAGS.map((id) => ({ description: `description of ${id}`, id })),
        });
    });

    it('writes one rationale per wrong choice to the staging file, none for the correct one, and leaves the bank untouched', async () => {
        await seed({ 'easy:free': [buildMc('q-1', 'p1'), buildBool('q-2', 'p2')] });
        const bankBefore = await readFile(join(contentDir, 'python/easy.json'), 'utf8');
        const report = await run(scripted({ tag: () => FIRST_TAG }));
        expect(await readJson(join(pipelineDir, 'enrichment/python/easy.json'))).toEqual({
            'q-1': [
                { choiceIndex: 0, misconceptionId: FIRST_TAG, rationale: 'rationale-0' },
                { choiceIndex: 2, misconceptionId: FIRST_TAG, rationale: 'rationale-2' },
            ],
            'q-2': [{ choiceIndex: 0, misconceptionId: FIRST_TAG, rationale: 'rationale-0' }],
        });
        expect(await readFile(join(contentDir, 'python/easy.json'), 'utf8')).toBe(bankBefore);
        expect(report.stage).toBe('enrich');
        expect(report.counts['enrich-accepted']).toBe(3);
    });

    it('drops a rationale the judge finds contradicting the oracle and reports rationale-contradicts-oracle', async () => {
        await seed({ 'easy:free': [buildMc('q-1', 'p1')] });
        const report = await run(scripted({ isConsistent: (text) => text !== 'rationale-2', tag: () => FIRST_TAG }));
        const written = await readJson(join(pipelineDir, 'enrichment/python/easy.json'));
        expect(written['q-1']).toEqual([{ choiceIndex: 0, misconceptionId: FIRST_TAG, rationale: 'rationale-0' }]);
        expect(report.counts['rationale-contradicts-oracle']).toBe(1);
        expect(logs.some((line) => line.includes('rationale-contradicts-oracle'))).toBe(true);
    });

    it('reports the misconception agreement rate of two tagging runs and drops a disagreeing tag', async () => {
        await seed({ 'easy:free': [buildMc('q-1', 'p1')] });
        // Choice 0 gets the same tag both runs; choice 2 gets different tags.
        const report = await run(
            scripted({ tag: (callIndex, choiceIndex) => (choiceIndex === 2 && callIndex === 1 ? SECOND_TAG : FIRST_TAG) }),
        );
        expect(report.agreement).toEqual({ enrich: 0.5 });
        const written = await readJson(join(pipelineDir, 'enrichment/python/easy.json'));
        expect(written['q-1']).toEqual([{ choiceIndex: 0, misconceptionId: FIRST_TAG, rationale: 'rationale-0' }]);
    });

    it('conditions the prompts on the observed output', async () => {
        await seed({ 'easy:free': [buildBool('q-1', 'p1')] });
        const provider = scripted({ tag: () => FIRST_TAG });
        await run(provider);
        expect(provider.prompts.length).toBeGreaterThan(0);
        expect(provider.prompts.every((prompt) => prompt.includes(OBSERVED))).toBe(true);
    });

    it('skips a language whose approved taxonomy is empty, logs it, and calls no model', async () => {
        await seed({ 'easy:free': [buildBool('q-1', 'p1')] });
        await writeFile(join(pipelineDir, 'taxonomy/python.json'), '[]');
        const provider = scripted({ tag: () => FIRST_TAG });
        await run(provider);
        expect(logs).toContain('skipping language python: no approved taxonomy');
        expect(provider.prompts).toEqual([]);
        expect(await listFiles(join(pipelineDir, 'enrichment'))).toEqual([]);
    });

    it('skips a language whose approved taxonomy file is absent, even when a draft exists', async () => {
        await seed({ 'easy:free': [buildBool('q-1', 'p1')] });
        await writeFile(join(pipelineDir, 'taxonomy/python.draft.json'), JSON.stringify([{ description: 'd', id: FIRST_TAG }]));
        await rm(join(pipelineDir, 'taxonomy/python.json'));
        const provider = scripted({ tag: () => FIRST_TAG });
        await run(provider);
        expect(logs).toContain('skipping language python: no approved taxonomy');
        expect(provider.prompts).toEqual([]);
    });

    it('skips a question with no oracle observation without calling the model for it', async () => {
        await seed({ 'easy:free': [buildBool('q-1', 'p1'), buildBool('q-2', 'p2')] });
        const provider = scripted({ tag: () => FIRST_TAG });
        await run(provider, ['q-2']);
        const written = await readJson(join(pipelineDir, 'enrichment/python/easy.json'));
        expect(Object.keys(written)).toEqual(['q-1']);
        expect(provider.prompts.some((prompt) => prompt.includes('p2'))).toBe(false);
    });

    it('skips a question whose model output the schema rejects', async () => {
        await seed({ 'easy:free': [buildBool('q-1', 'p1')] });
        const report = await run(scripted({ tag: () => 'python.not-in-taxonomy' }));
        expect(await listFiles(join(pipelineDir, 'enrichment'))).toEqual([]);
        expect(report.counts['enrich-accepted']).toBe(0);
        expect(logs.some((line) => line.includes('model-output-invalid'))).toBe(true);
    });

    describe('rerun over an existing staging file', () => {
        const earlier = { choiceIndex: 0, misconceptionId: SECOND_TAG, rationale: 'earlier' };

        it('keeps earlier rationales for a question this run skipped, and replaces one it re-enriched', async () => {
            await seed({ 'easy:free': [buildBool('q-1', 'p1'), buildBool('q-2', 'p2')] });
            await writeTree(pipelineDir, {
                'enrichment/python/easy.json': { 'q-1': [earlier], 'q-2': [earlier] },
            });
            await run(scripted({ tag: () => FIRST_TAG }), ['q-2']);
            expect(await readJson(join(pipelineDir, 'enrichment/python/easy.json'))).toEqual({
                'q-1': [{ choiceIndex: 0, misconceptionId: FIRST_TAG, rationale: 'rationale-0' }],
                'q-2': [earlier],
            });
        });

        it('keeps earlier rationales for a question fully dropped now, and does not write {} when nothing was enriched', async () => {
            await seed({ 'easy:free': [buildBool('q-1', 'p1')] });
            await writeTree(pipelineDir, { 'enrichment/python/easy.json': { 'q-1': [earlier] } });
            await run(scripted({ isConsistent: () => false, tag: () => FIRST_TAG }));
            expect(await readJson(join(pipelineDir, 'enrichment/python/easy.json'))).toEqual({ 'q-1': [earlier] });
        });
    });

    it('writes paid output only under the content root, never under pipeline/ or content/', async () => {
        await seed({ 'medium:paid': [buildBool('paid-1', PAID_TEXT)] });
        const bankBefore = await readFile(join(contentDir, 'python/medium.json'), 'utf8');
        await run(scripted({ tag: () => FIRST_TAG }));
        expect(await readJson(join(contentRoot, 'enrichment/python/medium.json'))).toEqual({
            'paid-1': [{ choiceIndex: 0, misconceptionId: FIRST_TAG, rationale: 'rationale-0' }],
        });
        expect(await listFiles(join(pipelineDir, 'enrichment'))).toEqual([]);
        const pipelineText = (
            await Promise.all((await listFiles(pipelineDir)).map((name) => readFile(join(pipelineDir, name), 'utf8')))
        ).join('');
        expect(pipelineText).not.toContain(PAID_TEXT);
        expect(await readFile(join(contentDir, 'python/medium.json'), 'utf8')).toBe(bankBefore);
        expect(logs.join('\n')).not.toContain(PAID_TEXT);
    });

    it('refuses a content root inside the pipeline directory when a paid bank exists', async () => {
        await seed({ 'medium:paid': [buildBool('paid-1', PAID_TEXT)] });
        await expect(
            run(scripted({ tag: () => FIRST_TAG }), [], { contentRoot: join(pipelineDir, 'private') }),
        ).rejects.toThrow('content root');
    });
});
