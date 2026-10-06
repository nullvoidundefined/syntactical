// Batch-prompt rules that review found the sandbox cannot enforce: true/false answers must be
// balanced, a card's code must show every value its answer depends on, and a count(*) question
// asks for the printed count, not a row count.
import { describe, expect, it } from 'vitest';

import { generateBatch } from '../../../services/gapFill/generateBatch.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';

async function captureBatchPrompt(): Promise<string> {
    let captured = '';
    const provider = {
        async generate(request: { prompt: string }) {
            captured = request.prompt;
            return { model: 'fake-model', value: { cards: [] } };
        },
    } as unknown as ModelProvider;
    await generateBatch({
        count: 4,
        difficulty: 'easy',
        existingPrompts: new Set<string>(),
        language: 'python',
        languageId: 'python',
        provider,
        run: async () => ({ outcome: 'value', runtimeVersion: '3.13', value: '' }),
        topic: 'strings',
    });
    return captured;
}

describe('generateBatch prompt rules', () => {
    it('asks for roughly as many false bool answers as true ones', async () => {
        expect(await captureBatchPrompt()).toMatch(/bool[^\n]*(half|balance)[^\n]*false/i);
    });

    it('requires the shown code to contain every value the answer depends on', async () => {
        expect(await captureBatchPrompt()).toMatch(/code[^\n]*every (value|row|input)[^\n]*answer depends on/i);
    });

    it('asks count(*) questions about the printed count, not the number of rows', async () => {
        expect(await captureBatchPrompt()).toMatch(/count\(\*\)[^\n]*printed count/i);
    });
});
