// TypeScript Types track: the content id `typescript-types` runs its oracles in the typescript
// runner, topics.json gives it ten type-level topics, and the batch prompt restricts cards to
// type questions proven with the compiler helpers.
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ORACLE_LANGUAGES } from '../../services/ORACLE_LANGUAGES.js';
import { readFallbackTopics } from '../../services/classify/readFallbackTopics.js';
import { generateBatch } from '../../services/gapFill/generateBatch.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const TOPICS_FILE = fileURLToPath(new URL('../../../topics.json', import.meta.url));

async function captureTypesBatchPrompt(): Promise<string> {
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
        language: 'typescript',
        languageId: 'typescript-types',
        provider,
        run: async () => ({ outcome: 'value', runtimeVersion: 'TypeScript 5', value: '' }),
        topic: 'conditional-types',
    });
    return captured;
}

describe('typescript-types oracle language', () => {
    it('runs typescript-types oracles in the typescript runner', () => {
        expect(ORACLE_LANGUAGES['typescript-types']).toBe('typescript');
    });
});

describe('typescript-types topics', () => {
    it('lists exactly the ten type-level topics', async () => {
        const topics = await readFallbackTopics(TOPICS_FILE);

        expect(topics['typescript-types']).toEqual([
            'conditional-types',
            'infer',
            'mapped-types',
            'template-literal-types',
            'distributive-conditionals',
            'variance-and-assignability',
            'overloads-and-satisfies',
            'discriminated-unions',
            'generic-constraints',
            'recursive-and-indexed-types',
        ]);
    });
});

describe('generateBatch typescript-types note', () => {
    it('tells a typescript-types batch that every card is a type question', async () => {
        const prompt = await captureTypesBatchPrompt();

        expect(prompt).toMatch(/languageId[^\n]*typescript-types[^\n]*type question/i);
        expect(prompt).toContain('countTypeErrors');
        expect(prompt).toContain('typeOf');
        expect(prompt).toMatch(/typescript-types[^\n]*no runtime-output/i);
    });
});
