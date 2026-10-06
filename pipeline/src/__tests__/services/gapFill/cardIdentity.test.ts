// Short neutral prompts repeat across cards ("What does this program print?"), so a card is a
// duplicate only when its prompt and its code both match. The generated id follows the same
// identity, so two cards that differ only in code never share an id.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fillBank } from '../../../services/gapFill/fillBank.js';
import { generateBatch } from '../../../services/gapFill/generateBatch.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';
import type { OracleRun } from '../../../types/OracleRun.js';

const NEUTRAL = 'What does this program print?';

function mcCard(code: string): Record<string, unknown> {
    return {
        answerIndex: 0,
        choices: [
            { text: '3' },
            { rationale: 'Tempting but wrong.', text: 'a' },
            { rationale: 'Tempting but wrong.', text: 'b' },
            { rationale: 'Tempting but wrong.', text: 'c' },
        ],
        code,
        oracle: { code: `print(3)  # ${code}` },
        prompt: NEUTRAL,
        query: { explanation: 'e', title: 't' },
        type: 'mc',
    };
}

async function run(): Promise<OracleRun> {
    return { outcome: 'value', runtimeVersion: 'Python 3.13.1', value: '3' };
}

function provide(cards: () => Record<string, unknown>[]): ModelProvider {
    return {
        async generate() {
            return { model: 'fake-model', value: { cards: cards() } };
        },
    } as unknown as ModelProvider;
}

function batch(cards: Record<string, unknown>[]) {
    return generateBatch({
        count: 10,
        difficulty: 'medium',
        existingPrompts: new Set<string>(),
        language: 'python',
        languageId: 'python',
        provider: provide(() => cards),
        run,
        topic: 'strings',
    });
}

describe('card identity is prompt plus code', () => {
    it('keeps two cards with the same prompt and different code, with distinct ids', async () => {
        const result = await batch([mcCard('x = 1'), mcCard('y = 2')]);
        expect(result.cards).toHaveLength(2);
        const ids = result.cards.map(({ question }) => question.id);
        expect(new Set(ids).size).toBe(2);
        expect(result.drops.duplicate).toBeUndefined();
    });

    it('still drops a card whose prompt and code both repeat', async () => {
        const result = await batch([mcCard('x = 1'), mcCard('x = 1')]);
        expect(result.cards).toHaveLength(1);
        expect(result.drops.duplicate).toBe(1);
    });

    describe('fillBank', () => {
        let outRoot: string;

        beforeEach(async () => {
            outRoot = await mkdtemp(join(tmpdir(), 'card-identity-'));
            await mkdir(join(outRoot, 'classifications', 'python'), { recursive: true });
            await writeFile(join(outRoot, 'classifications', 'python', 'medium.json'), '{}');
        });

        afterEach(async () => {
            await rm(outRoot, { force: true, recursive: true });
        });

        it('does not treat a bank card with the same neutral prompt but other code as a duplicate', async () => {
            const existing = {
                ...mcCard('already = 0'),
                id: 'existing-1',
                oracle: undefined,
                provenance: {
                    isHumanReviewed: false,
                    source: 'generated',
                    validation: { method: 'executed', status: 'passed' },
                },
                topic: 'strings',
            } as unknown as Question;
            let call = 0;
            await fillBank({
                bankKey: 'python/medium',
                difficulty: 'medium',
                language: 'python',
                languageId: 'python',
                log: () => undefined,
                outRoot,
                provider: provide(() => (call++ === 0 ? [mcCard('fresh = 1')] : [])),
                questions: [existing],
                run,
                topics: ['strings'],
            });
            const staged = JSON.parse(await readFile(join(outRoot, 'generated', 'python', 'medium.json'), 'utf8')) as {
                questions: { code: string }[];
            };
            expect(staged.questions.map(({ code }) => code)).toEqual(['fresh = 1']);
        });
    });
});
