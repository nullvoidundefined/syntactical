// `pipeline enrich` reads each bank's oracles from that bank's own root (free: pipeline/oracles,
// paid: content root oracles), covers the staged generated questions as well as the bank's own,
// and writes nothing of a paid bank under the pipeline dir. Fake provider and fake validator.
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enrich } from '../../commands/enrich.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';

const HASH = '0123456789abcdef'.repeat(4);
const TAG = 'python.mutable-default-args';
const PAID_TEXT = 'PAID-ENRICH-MARKER';

type Access = 'free' | 'paid';

function buildMc(id: string, prompt: string): Record<string, unknown> {
    return { answerIndex: 1, choices: [{ text: 'A' }, { text: 'B' }, { text: 'C' }], id, prompt, type: 'mc' };
}

function oracleOf(code: string): Oracle {
    return { code, language: 'python' };
}

// Answers the write and judge calls the way the real provider's schemas allow.
function scriptedProvider(): ModelProvider {
    return {
        async generate(request: { prompt: string; promptVersion: string; schema: { parse: (v: unknown) => unknown } }) {
            let value: unknown;
            if (request.promptVersion === 'judge-rationale-v1') {
                value = { isConsistent: true, reason: 'because' };
            } else {
                const wrong = /for each of these choice indexes: ([\d, ]+)\./.exec(request.prompt)?.[1] ?? '';
                value = {
                    rationales: wrong.split(', ').map((index) => ({
                        choiceIndex: Number(index),
                        misconceptionId: TAG,
                        rationale: `rationale-${index}`,
                    })),
                };
            }
            return { model: 'fake', value: request.schema.parse(value) };
        },
    } as unknown as ModelProvider;
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

describe('enrich oracle roots and staged questions', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    // The oracle each question was validated with (null when it had none).
    let seen: Map<string, Oracle | null>;
    // Every question id validate was called for, in order, so a duplicate shows up.
    let validated: string[];

    function run() {
        return enrich({
            contentDir,
            contentRoot,
            log: () => undefined,
            newRunId: () => 'run-1',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
            provider: scriptedProvider(),
            validate: async ({ id }, oracle) => {
                seen.set(id, oracle);
                validated.push(id);
                return oracle === null ? { status: 'not-executable' } : { observed: 'OBSERVED', status: 'passed' };
            },
        } as Parameters<typeof enrich>[0]);
    }

    async function seed(access: Access, bankIds: string[], generatedIds: string[] = []): Promise<string> {
        const outRoot = access === 'free' ? pipelineDir : contentRoot;
        const productId = access === 'paid' ? { productId: 'syntactical.python.easy' } : {};
        const language = {
            banks: {
                easy: {
                    access,
                    contentVersion: 1,
                    hash: HASH,
                    path: 'python/easy.json',
                    topicCounts: {},
                    ...productId,
                },
            },
            glyph: 'G',
            grammar: 'plain',
            id: 'python',
            label: 'L',
            misconceptions: [],
            tagline: 'T',
            topics: [],
        };
        const text = access === 'paid' ? PAID_TEXT : 'free';
        await writeJson(join(contentDir, 'manifest.json'), { languages: [language], schemaVersion: 2 });
        await writeJson(join(access === 'free' ? contentDir : contentRoot, 'python/easy.json'), {
            questions: bankIds.map((id) => buildMc(id, `${text} ${id}`)),
        });
        if (generatedIds.length > 0) {
            await writeJson(join(outRoot, 'generated/python/easy.json'), {
                questions: generatedIds.map((id) => buildMc(id, `${text} ${id}`)),
                schemaVersion: 2,
            });
        }
        return outRoot;
    }

    beforeEach(async () => {
        seen = new Map();
        validated = [];
        root = await mkdtemp(join(tmpdir(), 'enrich-oracle-roots-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeJson(join(pipelineDir, 'taxonomy/python.json'), [{ description: 'd', id: TAG }]);
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('reads a free bank oracles from the pipeline dir', async () => {
        await seed('free', ['q-1']);
        await writeJson(join(pipelineDir, 'oracles/python/easy.json'), { 'q-1': oracleOf('FREE-ORACLE') });
        await run();
        expect(seen.get('q-1')).toEqual(oracleOf('FREE-ORACLE'));
    });

    it('reads a paid bank oracles from the content root and never from the pipeline dir', async () => {
        await seed('paid', ['q-1', 'q-2']);
        await writeJson(join(contentRoot, 'oracles/python/easy.json'), { 'q-1': oracleOf('PAID-ORACLE') });
        await writeJson(join(pipelineDir, 'oracles/python/easy.json'), {
            'q-1': oracleOf('DECOY-ORACLE'),
            'q-2': oracleOf('DECOY-ORACLE'),
        });
        await run();
        expect(seen.get('q-1')).toEqual(oracleOf('PAID-ORACLE'));
        expect(seen.get('q-2')).toBeNull();
        const enriched = await readJson(join(contentRoot, 'enrichment/python/easy.json'));
        expect(Object.keys(enriched)).toEqual(['q-1']);
    });

    it('enriches staged generated questions into the same enrichment file as the bank questions', async () => {
        const outRoot = await seed('free', ['q-1'], ['gen-1', 'gen-2']);
        await writeJson(join(outRoot, 'oracles/python/easy.json'), {
            'gen-1': oracleOf('G1'),
            'gen-2': oracleOf('G2'),
            'q-1': oracleOf('Q1'),
        });
        await run();
        const enriched = await readJson(join(outRoot, 'enrichment/python/easy.json'));
        expect(Object.keys(enriched).sort()).toEqual(['gen-1', 'gen-2', 'q-1']);
        expect(enriched['gen-1']).toEqual([
            { choiceIndex: 0, misconceptionId: TAG, rationale: 'rationale-0' },
            { choiceIndex: 2, misconceptionId: TAG, rationale: 'rationale-2' },
        ]);
    });

    it('skips a staged generated question that has no oracle', async () => {
        const outRoot = await seed('free', ['q-1'], ['gen-1']);
        await writeJson(join(outRoot, 'oracles/python/easy.json'), { 'q-1': oracleOf('Q1') });
        await run();
        expect(Object.keys(await readJson(join(outRoot, 'enrichment/python/easy.json')))).toEqual(['q-1']);
    });

    it('enriches a paid bank with its staged questions and writes nothing of it under the pipeline dir', async () => {
        const outRoot = await seed('paid', ['paid-q-1'], ['paid-gen-1']);
        expect(outRoot).toBe(contentRoot);
        await writeJson(join(contentRoot, 'oracles/python/easy.json'), {
            'paid-gen-1': oracleOf('G1'),
            'paid-q-1': oracleOf('Q1'),
        });
        await run();
        const enriched = await readJson(join(contentRoot, 'enrichment/python/easy.json'));
        expect(Object.keys(enriched).sort()).toEqual(['paid-gen-1', 'paid-q-1']);
        // Paid text never lands under the pipeline dir. Reports carry ids and verdicts only, as every
        // other command's reports already do, so ids are allowed there and nowhere else.
        for (const name of await listFiles(pipelineDir)) {
            const text = await readFile(join(pipelineDir, name), 'utf8');
            expect(text).not.toContain(PAID_TEXT);
            if (!name.startsWith('reports')) {
                expect(text).not.toContain('paid-gen-1');
                expect(text).not.toContain('paid-q-1');
            }
        }
        expect(await listFiles(join(pipelineDir, 'enrichment'))).toEqual([]);
    });

    it('enriches a question once when it is both in the bank and still staged after publish', async () => {
        const outRoot = await seed('free', ['q-1', 'gen-1'], ['gen-1']);
        await writeJson(join(outRoot, 'oracles/python/easy.json'), { 'gen-1': oracleOf('G1'), 'q-1': oracleOf('Q1') });
        await run();
        expect(validated.filter((id) => id === 'gen-1')).toHaveLength(1);
    });

    it('keeps reports in the pipeline dir so every command shares one report chain', async () => {
        await seed('paid', ['paid-q-1']);
        await writeJson(join(contentRoot, 'oracles/python/easy.json'), { 'paid-q-1': oracleOf('Q1') });
        await run();
        expect(await listFiles(join(pipelineDir, 'reports'))).not.toEqual([]);
        expect(await listFiles(join(contentRoot, 'reports'))).toEqual([]);
    });
});
