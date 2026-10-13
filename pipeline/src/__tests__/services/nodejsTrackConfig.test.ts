// Node.js track: the content id `nodejs` runs its oracles in the node runner, pipeline/topics.json
// gives it its own ten runtime and standard-library topics, and the batch prompt keeps cards off
// core JavaScript and off the network.
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ORACLE_LANGUAGES } from '../../services/ORACLE_LANGUAGES.js';
import { readFallbackTopics } from '../../services/classify/readFallbackTopics.js';
import { generateBatch } from '../../services/gapFill/generateBatch.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const TOPICS_FILE = fileURLToPath(new URL('../../../topics.json', import.meta.url));

async function captureNodejsBatchPrompt(): Promise<string> {
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
        language: 'node',
        languageId: 'nodejs',
        provider,
        run: async () => ({ outcome: 'value', runtimeVersion: 'v22', value: '' }),
        topic: 'streams',
    });
    return captured;
}

describe('nodejs oracle language', () => {
    it('runs nodejs oracles in the node runner', () => {
        expect(ORACLE_LANGUAGES.nodejs).toBe('node');
    });
});

describe('nodejs topics', () => {
    it('lists exactly the ten nodejs topics', async () => {
        const topics = await readFallbackTopics(TOPICS_FILE);

        expect(topics.nodejs).toEqual([
            'event-loop-and-timers',
            'event-emitter',
            'streams',
            'buffers-and-encodings',
            'fs',
            'path-and-url',
            'modules',
            'error-handling',
            'process-and-env',
            'async-patterns',
        ]);
    });
});

describe('generateBatch nodejs note', () => {
    it('tells a nodejs batch to test Node runtime behavior with no network and /tmp files', async () => {
        const prompt = await captureNodejsBatchPrompt();

        expect(prompt).toMatch(/languageId[^\n]*nodejs[^\n]*Node\.js runtime/i);
        expect(prompt).toMatch(/not core JavaScript/i);
        expect(prompt).toMatch(/no network/i);
        expect(prompt).toContain('/tmp');
        expect(prompt).toContain('require');
    });
});

describe('generateBatch nodejs module rule', () => {
    // The node runner executes oracles as ES modules, where a bare `require` is a ReferenceError;
    // a live batch lost most cards to answer-mismatch for this reason.
    it('tells a nodejs batch the oracle runs as an ES module: import, or createRequire for CommonJS', async () => {
        const prompt = await captureNodejsBatchPrompt();

        expect(prompt).toMatch(/nodejs[^\n]*ES module/i);
        expect(prompt).toMatch(/nodejs[^\n]*\bimport\b/);
        expect(prompt).toMatch(/nodejs[^\n]*createRequire/);
    });
});
