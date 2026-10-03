// enrichQuestion tallies with a scripted provider (no model).
import type { Question } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { enrichQuestion } from '../../../services/enrich/enrichQuestion.js';
import { ModelOutputInvalid } from '../../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';

const TAXONOMY = [
    { description: 'a', id: 'python.one' },
    { description: 'b', id: 'python.two' },
];

const MC: Question = {
    answerIndex: 1,
    choices: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
    id: 'q-1',
    prompt: 'p',
    provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'executed', status: 'passed' } },
    query: { explanation: 'e', title: 't' },
    type: 'mc',
};

function entries(tags: [string, string]): unknown {
    return {
        rationales: [
            { choiceIndex: 0, misconceptionId: tags[0], rationale: 'r0' },
            { choiceIndex: 2, misconceptionId: tags[1], rationale: 'r2' },
        ],
    };
}

describe('enrichQuestion', () => {
    it('returns zeroed tallies when the model output turns invalid after drops were recorded', async () => {
        let writes = 0;
        const provider: ModelProvider = {
            async generate(request) {
                if (request.promptVersion === 'judge-rationale-v1') {
                    // The first agreeing choice reaches the judge, which fails.
                    throw new ModelOutputInvalid(request.promptVersion, 'bad');
                }
                writes += 1;
                // Choice 0 disagrees between the runs (a drop is recorded); choice 2 agrees, so it is judged.
                const tags: [string, string] = writes === 1 ? ['python.one', 'python.two'] : ['python.two', 'python.two'];
                return { model: 'fake', value: request.schema.parse(entries(tags)) };
            },
        };
        const outcome = await enrichQuestion(MC, 'out', TAXONOMY, provider);
        expect(outcome).toEqual({ accepted: [], agreed: 0, compared: 0, drops: [], isInvalid: true });
    });
});
