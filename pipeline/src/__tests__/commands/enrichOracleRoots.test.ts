// `pipeline enrich` reads each bank's oracles from pipeline/oracles and covers the staged generated questions as
// well as the bank's own. Fake provider and fake validator.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enrich } from '../../commands/enrich.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';
import { readJson, writeJson } from '../fixtures/jsonFiles.js';
import { buildBankEntry, buildLanguage, buildManifest } from '../fixtures/manifest.js';

const TAG = 'python.mutable-default-args';

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

describe('enrich oracle roots and staged questions', () => {
    let root: string;
    let contentDir: string;
    let pipelineDir: string;
    // The oracle each question was validated with (null when it had none).
    let seen: Map<string, Oracle | null>;
    // Every question id validate was called for, in order, so a duplicate shows up.
    let validated: string[];

    function run() {
        return enrich({
            contentDir,
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

    async function seed(bankIds: string[], generatedIds: string[] = []): Promise<string> {
        const language = buildLanguage({ banks: { easy: buildBankEntry('python/easy.json') } });
        await writeJson(join(contentDir, 'manifest.json'), buildManifest(language));
        await writeJson(join(contentDir, 'python/easy.json'), {
            questions: bankIds.map((id) => buildMc(id, `prompt ${id}`)),
        });
        if (generatedIds.length > 0) {
            await writeJson(join(pipelineDir, 'generated/python/easy.json'), {
                questions: generatedIds.map((id) => buildMc(id, `prompt ${id}`)),
                schemaVersion: 2,
            });
        }
        return pipelineDir;
    }

    beforeEach(async () => {
        seen = new Map();
        validated = [];
        root = await mkdtemp(join(tmpdir(), 'enrich-oracle-roots-'));
        contentDir = join(root, 'repo/content');
        pipelineDir = join(root, 'repo/pipeline');
        await writeJson(join(pipelineDir, 'taxonomy/python.json'), [{ description: 'd', id: TAG }]);
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('reads a bank oracles from the pipeline dir', async () => {
        await seed(['q-1']);
        await writeJson(join(pipelineDir, 'oracles/python/easy.json'), { 'q-1': oracleOf('FREE-ORACLE') });
        await run();
        expect(seen.get('q-1')).toEqual(oracleOf('FREE-ORACLE'));
    });

    it('enriches staged generated questions into the same enrichment file as the bank questions', async () => {
        const outRoot = await seed(['q-1'], ['gen-1', 'gen-2']);
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
        const outRoot = await seed(['q-1'], ['gen-1']);
        await writeJson(join(outRoot, 'oracles/python/easy.json'), { 'q-1': oracleOf('Q1') });
        await run();
        expect(Object.keys(await readJson(join(outRoot, 'enrichment/python/easy.json')))).toEqual(['q-1']);
    });

    it('enriches a question once when it is both in the bank and still staged after publish', async () => {
        const outRoot = await seed(['q-1', 'gen-1'], ['gen-1']);
        await writeJson(join(outRoot, 'oracles/python/easy.json'), { 'gen-1': oracleOf('G1'), 'q-1': oracleOf('Q1') });
        await run();
        expect(validated.filter((id) => id === 'gen-1')).toHaveLength(1);
    });
});
