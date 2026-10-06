// generateBatch on Easy drops mc cards whose correct answer prints more than two values, so an
// Easy card asks about one or two things at a time. Values are separated by whitespace or commas
// outside brackets and quotes, so one printed slice, map, or quoted string counts as one value.
import { describe, expect, it } from 'vitest';

import { generateBatch } from '../../../services/gapFill/generateBatch.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';
import type { Oracle } from '../../../types/Oracle.js';
import type { OracleRun } from '../../../types/OracleRun.js';

function mcCard(tag: string, answer: string): Record<string, unknown> {
    return {
        answerIndex: 0,
        choices: [
            { text: answer },
            { rationale: 'Tempting but wrong.', text: `wrong-${tag}-a` },
            { rationale: 'Tempting but wrong.', text: `wrong-${tag}-b` },
            { rationale: 'Tempting but wrong.', text: `wrong-${tag}-c` },
        ],
        oracle: { code: `print(x)  # OUT:${answer}` },
        prompt: `What does case ${tag} print?`,
        query: { explanation: 'e', title: 't' },
        type: 'mc',
    };
}

function boolCard(tag: string): Record<string, unknown> {
    return {
        answer: true,
        oracle: { code: 'print(x)  # OUT:True' },
        prompt: `Does case ${tag} print three values?`,
        query: { explanation: 'e', title: 't' },
        rationale: 'It prints True.',
        type: 'bool',
    };
}

async function run(oracle: Oracle): Promise<OracleRun> {
    const value = /OUT:(.*)$/.exec(oracle.code)?.[1]?.trim() ?? '';
    return { outcome: 'value', runtimeVersion: 'Python 3.13.1', value };
}

async function generate(difficulty: string, cards: Record<string, unknown>[]) {
    const provider = {
        async generate() {
            return { model: 'fake-model', value: { cards } };
        },
    } as unknown as ModelProvider;
    return generateBatch({
        count: 10,
        difficulty,
        existingPrompts: new Set<string>(),
        language: 'python',
        languageId: 'python',
        provider,
        run,
        topic: 'strings',
    });
}

describe('generateBatch Easy density', () => {
    it.each([
        ['three space-separated values', '3 -1 3.5'],
        ['four values', 'false 2 true false'],
        ['three comma-separated values', '0,1,3'],
        ['a slice plus two numbers', '[1 2] 3 4'],
    ])('drops an Easy mc card whose answer has %s', async (_label, answer) => {
        const result = await generate('easy', [mcCard('dense', answer)]);
        expect(result.cards).toHaveLength(0);
        expect(result.drops['too-dense']).toBe(1);
    });

    it.each([
        ['one value', '44'],
        ['two values', '3 3.5'],
        ['one printed slice', '[1 3 5 8]'],
        ['one printed map and a number', 'map[apple:2 mango:3 zebra:1] 3'],
        ['one quoted string with spaces', '"hello big world"'],
        ['one struct', '{Ann 30 true}'],
    ])('keeps an Easy mc card whose answer is %s', async (_label, answer) => {
        const result = await generate('easy', [mcCard('ok', answer)]);
        expect(result.cards).toHaveLength(1);
        expect(result.drops['too-dense']).toBeUndefined();
    });

    it('keeps a dense answer on Medium and Hard', async () => {
        for (const difficulty of ['medium', 'hard']) {
            const result = await generate(difficulty, [mcCard(`dense-${difficulty}`, '3 -1 3.5')]);
            expect(result.cards).toHaveLength(1);
        }
    });

    it('does not apply the density rule to bool cards', async () => {
        const result = await generate('easy', [boolCard('b')]);
        expect(result.cards).toHaveLength(1);
    });
});
