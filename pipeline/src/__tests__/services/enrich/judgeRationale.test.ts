// judgeRationale with a fake provider: the verdict passes through, and the prompt carries
// the observed output and the rationale to check.
import type { Question } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { judgeRationale } from '../../../services/enrich/judgeRationale.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';

const QUESTION: Question = {
    answer: false,
    id: 'q-1',
    prompt: 'Is it true?',
    provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'executed', status: 'passed' } },
    query: { explanation: 'e', title: 't' },
    type: 'bool',
};

function reply(value: unknown): ModelProvider & { prompts: string[] } {
    const prompts: string[] = [];
    return {
        async generate(request) {
            prompts.push(request.prompt);
            return { model: 'fake', value: request.schema.parse(value) };
        },
        prompts,
    };
}

describe('judgeRationale', () => {
    it.each([true, false])('returns the judge verdict %s unchanged', async (isConsistent) => {
        const result = await judgeRationale(QUESTION, 'out', 'why', reply({ isConsistent, reason: 'because' }));
        expect(result).toEqual({ isConsistent, reason: 'because' });
    });

    it('puts the observed output and the rationale in the prompt', async () => {
        const provider = reply({ isConsistent: true, reason: 'ok' });
        await judgeRationale(QUESTION, 'OBSERVED-9912', 'RATIONALE-TEXT-5543', provider);
        expect(provider.prompts[0]).toContain('OBSERVED-9912');
        expect(provider.prompts[0]).toContain('RATIONALE-TEXT-5543');
    });

    it('rejects a verdict that is not a boolean', async () => {
        await expect(judgeRationale(QUESTION, 'o', 'r', reply({ isConsistent: 'yes', reason: 'x' }))).rejects.toThrow();
    });
});
