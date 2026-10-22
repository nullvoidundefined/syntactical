// A question with no oracle observation is enriched from its answer key and explanation: the
// answer-key prompts carry the explanation, and two judges on different models must both accept a
// rationale. A split or a double rejection drops it; without a second judge the question is skipped.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enrichBank } from '../../../services/enrich/enrichBank.js';
import { enrichQuestion } from '../../../services/enrich/enrichQuestion.js';
import type { ModelProvider, ModelRequest } from '../../../types/ModelProvider.js';

const TAXONOMY = [{ description: 'a', id: 'postgres.one' }];
const EXPLANATION = 'EXPLANATION-5520: \\l lists databases.';

const MC: Question = {
    answerIndex: 1,
    choices: [{ text: '\\dt' }, { text: '\\l' }],
    id: 'q-1',
    prompt: 'prompt q-1',
    provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
    query: { explanation: EXPLANATION, title: 't' },
    type: 'mc',
};

// Writes one rationale for choice 0 and answers every judge call with `isConsistent`.
function provider(isConsistent: boolean, requests: ModelRequest<unknown>[] = []): ModelProvider {
    return {
        async generate(request) {
            requests.push(request as ModelRequest<unknown>);
            const value = request.promptVersion.startsWith('judge-rationale')
                ? { isConsistent, reason: 'r' }
                : {
                      rationales: [
                          { choiceIndex: 0, misconceptionId: 'postgres.one', rationale: 'They mixed up \\dt.' },
                      ],
                  };
            return { model: 'fake', value: request.schema.parse(value) };
        },
    };
}

describe('enrichQuestion from the answer key', () => {
    it('uses the answer-key prompts with the explanation, and accepts when both judges agree', async () => {
        const firstRequests: ModelRequest<unknown>[] = [];
        const secondRequests: ModelRequest<unknown>[] = [];
        const outcome = await enrichQuestion(
            MC,
            undefined,
            TAXONOMY,
            provider(true, firstRequests),
            provider(true, secondRequests),
        );
        expect(outcome.accepted).toEqual([
            { choiceIndex: 0, misconceptionId: 'postgres.one', rationale: 'They mixed up \\dt.' },
        ]);
        expect(firstRequests.map(({ promptVersion }) => promptVersion)).toEqual([
            'write-rationales-from-key-v1',
            'write-rationales-from-key-v1',
            'judge-rationale-from-key-v1',
        ]);
        expect(secondRequests.map(({ promptVersion }) => promptVersion)).toEqual(['judge-rationale-from-key-v1']);
        expect(firstRequests.every(({ prompt }) => prompt.includes('EXPLANATION-5520'))).toBe(true);
    });

    it('drops a rationale the judges split on as judges-disagree', async () => {
        const outcome = await enrichQuestion(MC, undefined, TAXONOMY, provider(true), provider(false));
        expect(outcome.accepted).toEqual([]);
        expect(outcome.drops).toEqual([{ choiceIndex: 0, reason: 'judges-disagree' }]);
    });

    it('drops a rationale both judges reject as rationale-contradicts-key', async () => {
        const outcome = await enrichQuestion(MC, undefined, TAXONOMY, provider(false), provider(false));
        expect(outcome.drops).toEqual([{ choiceIndex: 0, reason: 'rationale-contradicts-key' }]);
    });

    it('keeps the single oracle judge when an observation exists', async () => {
        const secondRequests: ModelRequest<unknown>[] = [];
        const outcome = await enrichQuestion(
            MC,
            'List of databases',
            TAXONOMY,
            provider(true),
            provider(false, secondRequests),
        );
        expect(outcome.accepted).toHaveLength(1);
        expect(secondRequests).toEqual([]);
    });

    it('refuses to judge a question without an observation when no second judge is given', async () => {
        await expect(enrichQuestion(MC, undefined, TAXONOMY, provider(true))).rejects.toThrow(/second judge/);
    });
});

describe('enrichBank from the answer key', () => {
    let outRoot: string;

    beforeEach(async () => {
        outRoot = await mkdtemp(join(tmpdir(), 'enrich-key-'));
    });

    afterEach(async () => {
        await rm(outRoot, { force: true, recursive: true });
    });

    function run(secondProvider: ModelProvider | undefined, lines: string[]) {
        return enrichBank({
            bankKey: 'postgres/easy',
            difficulty: 'easy',
            languageId: 'postgres',
            log: (line) => lines.push(line),
            observe: async () => undefined,
            outRoot,
            provider: provider(true),
            questions: [MC],
            secondProvider,
            taxonomy: TAXONOMY,
        });
    }

    it('enriches a question with no oracle observation when a second judge is given', async () => {
        const result = await run(provider(true), []);
        expect(result.accepted).toBe(1);
        const saved = JSON.parse(await readFile(join(outRoot, 'enrichment/postgres/easy.json'), 'utf8'));
        expect(saved['q-1']).toHaveLength(1);
    });

    it('still skips such a question without a second judge', async () => {
        const lines: string[] = [];
        const result = await run(undefined, lines);
        expect(result.accepted).toBe(0);
        expect(lines).toContain('postgres/easy q-1: skipped, no oracle observation to condition on');
    });
});
