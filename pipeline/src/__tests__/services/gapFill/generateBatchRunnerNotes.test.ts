// The model cannot run code during batch generation, so the batch prompt must tell it what each
// runner starts with. The Rails runner opens an empty in-memory SQLite database: a program that
// queries a table it never created raises ActiveRecord::StatementInvalid and every card is lost.
import { describe, expect, it } from 'vitest';

import { generateBatch } from '../../../services/gapFill/generateBatch.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';

async function captureBatchPrompt(languageId = 'rails'): Promise<string> {
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
        language: languageId === 'sql' ? 'postgres' : 'rails',
        languageId,
        provider,
        run: async () => ({ outcome: 'value', runtimeVersion: 'Rails 8.0.2', value: '' }),
        topic: 'associations',
    });
    return captured;
}

describe('generateBatch runner notes', () => {
    it('tells a Rails batch that the database starts empty and tables must be created first', async () => {
        const prompt = await captureBatchPrompt();
        expect(prompt).toMatch(/rails[^\n]*empty in-memory SQLite/i);
        expect(prompt).toContain('ActiveRecord::Schema.define');
    });
});

describe('generateBatch rails Action Pack note', () => {
    it('tells a Rails batch that Action Pack is available after require', async () => {
        const prompt = await captureBatchPrompt();
        expect(prompt).toMatch(/rails[^\n]*require ['"]action_controller['"]/i);
        expect(prompt).toContain('ActionController::Parameters');
    });
});

describe('generateBatch sql shown setup', () => {
    it('tells a sql batch that the shown code includes CREATE TABLE and INSERT before the query', async () => {
        const prompt = await captureBatchPrompt('sql');
        expect(prompt).toMatch(/code[^\n]*(CREATE TABLE|create table)[^\n]*INSERT/);
    });
});
