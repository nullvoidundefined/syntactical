// SQL track: the content id `sql` runs its oracles in the postgres runner, pipeline/topics.json
// gives it its own ten SQL topics, and the batch prompt restricts cards to portable standard SQL.
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ORACLE_LANGUAGES } from '../../services/ORACLE_LANGUAGES.js';
import { readFallbackTopics } from '../../services/classify/readFallbackTopics.js';
import { generateBatch } from '../../services/gapFill/generateBatch.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const TOPICS_FILE = fileURLToPath(new URL('../../../topics.json', import.meta.url));

async function captureSqlBatchPrompt(): Promise<string> {
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
        language: 'postgres',
        languageId: 'sql',
        provider,
        run: async () => ({ outcome: 'value', runtimeVersion: 'PostgreSQL 16', value: '' }),
        topic: 'joins',
    });
    return captured;
}

describe('sql oracle language', () => {
    it('runs sql oracles in the postgres runner', () => {
        expect(ORACLE_LANGUAGES.sql).toBe('postgres');
    });
});

describe('sql topics', () => {
    it('lists exactly the ten sql topics', async () => {
        const topics = await readFallbackTopics(TOPICS_FILE);

        expect(topics.sql).toEqual([
            'filtering-and-nulls',
            'joins',
            'aggregation-and-grouping',
            'subqueries',
            'set-operations',
            'ordering',
            'window-functions',
            'ctes',
            'data-modification',
            'constraints-and-keys',
        ]);
    });
});

describe('generateBatch sql note', () => {
    it('tells a sql batch to use only portable standard SQL', async () => {
        const prompt = await captureSqlBatchPrompt();

        expect(prompt).toMatch(/languageId[^\n]*sql[^\n]*portable standard SQL/i);
        expect(prompt).toContain('::');
        expect(prompt).toContain('ILIKE');
        expect(prompt).toContain('RETURNING');
        expect(prompt).toContain('setupSql');
    });
});
