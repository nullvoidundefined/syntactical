// A multi-hour enrich run must survive a hung model call and keep its progress: a provider
// timeout skips that one question, each enriched question is saved as soon as it is accepted,
// and a rerun skips questions that already have rationales instead of paying for them again.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enrichBank } from '../../../services/enrich/enrichBank.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';
import { ProviderTransientError } from '../../../types/ProviderTransientError.js';

const TAXONOMY = [{ description: 'a', id: 'ruby.one' }];

function buildMc(id: string): Question {
    return {
        answerIndex: 1,
        choices: [{ text: 'A' }, { text: 'B' }],
        id,
        prompt: `prompt ${id}`,
        provenance: {
            isHumanReviewed: false,
            source: 'generated',
            validation: { method: 'executed', status: 'passed' },
        },
        query: { explanation: 'e', title: 't' },
        type: 'mc',
    };
}

// Answers every write and judge call; `failOn` makes calls for that question time out, and
// `crashAfter` throws a non-transient error once that many questions have been written.
function scriptedProvider(options: { failOn?: string; crashAfter?: number; prompts?: string[] } = {}): ModelProvider {
    const written = new Set<string>();
    return {
        async generate(request) {
            const id = /prompt (q-\d+)/.exec(request.prompt)?.[1] ?? '';
            options.prompts?.push(id);
            if (id === options.failOn) {
                throw new ProviderTransientError('model-timeout', 'claude timed out after 300000 ms');
            }
            if (request.promptVersion === 'judge-rationale-v1') {
                return { model: 'fake', value: request.schema.parse({ isConsistent: true, reason: 'ok' }) };
            }
            if (options.crashAfter !== undefined && !written.has(id) && written.size >= options.crashAfter) {
                throw new Error('provider died');
            }
            written.add(id);
            const value = { rationales: [{ choiceIndex: 0, misconceptionId: 'ruby.one', rationale: `why ${id}` }] };
            return { model: 'fake', value: request.schema.parse(value) };
        },
    } as ModelProvider;
}

describe('enrichBank resilience', () => {
    let outRoot: string;
    const file = () => join(outRoot, 'enrichment/ruby/easy.json');

    function run(provider: ModelProvider, questions: Question[]) {
        return enrichBank({
            bankKey: 'ruby/easy',
            difficulty: 'easy',
            languageId: 'ruby',
            log: () => undefined,
            observe: async () => 'OBSERVED',
            outRoot,
            provider,
            questions,
            taxonomy: TAXONOMY,
        });
    }

    async function saved(): Promise<string[]> {
        return Object.keys(JSON.parse(await readFile(file(), 'utf8')) as Record<string, unknown>).sort();
    }

    beforeEach(async () => {
        outRoot = await mkdtemp(join(tmpdir(), 'enrich-resume-'));
    });

    afterEach(async () => {
        await rm(outRoot, { force: true, recursive: true });
    });

    it('skips a question whose model call times out and enriches the rest', async () => {
        await run(scriptedProvider({ failOn: 'q-2' }), [buildMc('q-1'), buildMc('q-2'), buildMc('q-3')]);
        expect(await saved()).toEqual(['q-1', 'q-3']);
    });

    it('keeps every question enriched before a run dies', async () => {
        await expect(
            run(scriptedProvider({ crashAfter: 2 }), [buildMc('q-1'), buildMc('q-2'), buildMc('q-3')]),
        ).rejects.toThrow('provider died');
        expect(await saved()).toEqual(['q-1', 'q-2']);
    });

    it('does not call the model again for a question that already has rationales', async () => {
        await run(scriptedProvider(), [buildMc('q-1')]);
        const prompts: string[] = [];
        await run(scriptedProvider({ prompts }), [buildMc('q-1'), buildMc('q-2')]);
        expect(prompts.filter((id) => id === 'q-1')).toEqual([]);
        expect(await saved()).toEqual(['q-1', 'q-2']);
    });
});
