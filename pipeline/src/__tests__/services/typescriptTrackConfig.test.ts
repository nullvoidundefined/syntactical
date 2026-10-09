// TypeScript track: the content id `typescript` maps to its own oracle runner, topics.json lists
// its ten topics, and the batch prompt tells the model how type questions are proven.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateBatch } from '../../services/gapFill/generateBatch.js';
import { ORACLE_LANGUAGES } from '../../services/ORACLE_LANGUAGES.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const TOPICS_FILE = fileURLToPath(new URL('../../../topics.json', import.meta.url));

describe('typescript oracle language', () => {
    it('maps the typescript content id to its own runner', () => {
        expect(ORACLE_LANGUAGES.typescript).toBe('typescript');
    });

    it('lists the ten typescript topics in topics.json', () => {
        const topics = JSON.parse(readFileSync(TOPICS_FILE, 'utf8')) as Record<string, string[]>;

        expect(topics.typescript).toEqual([
            'types-and-inference',
            'unions-and-narrowing',
            'interfaces-vs-types',
            'generics',
            'utility-types',
            'literal-types',
            'any-unknown-never',
            'classes',
            'enums-and-const',
            'compile-vs-runtime',
        ]);
    });

    it('tells a typescript batch about the compiled oracle and the type helpers', async () => {
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
            languageId: 'typescript',
            provider,
            run: async () => ({ outcome: 'value', runtimeVersion: 'TypeScript 5', value: '' }),
            topic: 'generics',
        });

        expect(captured).toMatch(/typescript[^\n]*compiled/i);
        expect(captured).toContain("require('/harness/tsHelpers.js')");
        expect(captured).toContain('countTypeErrors');
        expect(captured).toContain('typeOf');
    });
});
