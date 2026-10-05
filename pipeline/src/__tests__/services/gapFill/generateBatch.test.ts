// generateBatch: one model call returns a batch of complete cards; the sandbox keeps the cards
// whose program proves the answer. Fake provider and fake runner, no Docker.
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { generateBatch } from '../../../services/gapFill/generateBatch.js';
import { normalizePrompt } from '../../../services/gapFill/normalizePrompt.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';
import type { Oracle } from '../../../types/Oracle.js';
import type { OracleRun } from '../../../types/OracleRun.js';

const RATIONALE_LIMIT = 280;
const TOPIC_RUNNERS = ['python', 'node', 'postgres'] as const;

type RawCard = Record<string, unknown>;
interface CardOptions {
    language?: string;
    setupSql?: string;
}

function buildOracle(output: string, options: CardOptions): Record<string, unknown> {
    return {
        code: `print('x')  # OUT:${output}`,
        ...(options.language === undefined ? {} : { language: options.language }),
        ...(options.setupSql === undefined ? {} : { setupSql: options.setupSql }),
    };
}

// A bool card whose oracle prints True. `answer: false` makes it an answer mismatch.
function boolCard(tag: string, options: CardOptions & { answer?: boolean } = {}): RawCard {
    return {
        answer: options.answer ?? true,
        oracle: buildOracle('True', options),
        prompt: `Does payload ${tag} return every row?`,
        query: { explanation: 'e', title: 't' },
        rationale: 'The OR clause makes the WHERE condition always true.',
        type: 'bool',
    };
}

// An mc card whose oracle prints `ans-<tag>`; choice 1 is the right one.
function mcCard(tag: string, options: CardOptions = {}): RawCard {
    return {
        answerIndex: 1,
        choices: [
            { rationale: 'Tempting but it never runs.', text: `wrong-${tag}-a` },
            { text: `ans-${tag}` },
            { rationale: 'Tempting but it throws.', text: `wrong-${tag}-b` },
            { rationale: 'Tempting but it is empty.', text: `wrong-${tag}-c` },
        ],
        oracle: buildOracle(`ans-${tag}`, options),
        prompt: `Which output does case ${tag} print?`,
        query: { explanation: 'e', title: 't' },
        type: 'mc',
    };
}

// The fake sandbox "executes" a program by reading its `OUT:<value>` marker.
function buildFakeRunner() {
    const oracles: Oracle[] = [];
    return {
        oracles,
        async run(oracle: Oracle): Promise<OracleRun> {
            oracles.push(oracle);
            const value = /OUT:(.*)$/.exec(oracle.code)?.[1]?.trim() ?? '';
            return { outcome: 'value', runtimeVersion: 'Python 3.13.1', value };
        },
    };
}

// The provider returns its value unparsed, so the implementation must validate each card itself.
// The topic and count come from the `TOPIC: <id>` and `COUNT: <n>` lines of the prompt.
function buildProvider(script: () => RawCard[]) {
    const calls: { count: number; prompt: string; topic: string }[] = [];
    const provider = {
        async generate(request: { prompt: string }) {
            const { prompt } = request;
            calls.push({
                count: Number(/COUNT: (\d+)/.exec(prompt)?.[1] ?? 0),
                prompt,
                topic: /TOPIC: (\S+)/.exec(prompt)?.[1] ?? 'none',
            });
            return { model: 'fake-model', value: { cards: script() } };
        },
    } as unknown as ModelProvider;
    return { calls, provider };
}

function languageArgs(provider: ModelProvider, run: ReturnType<typeof buildFakeRunner>) {
    return {
        count: 4,
        difficulty: 'easy',
        existingPrompts: new Set<string>(),
        language: 'python' as const,
        languageId: 'python',
        provider,
        run: run.run,
        topic: 'strings',
    };
}

function topicArgs(provider: ModelProvider, run: ReturnType<typeof buildFakeRunner>) {
    const { language: _language, ...rest } = languageArgs(provider, run);
    return { ...rest, languageId: 'backend-security', runners: TOPIC_RUNNERS, topic: 'sql-injection' };
}

function withoutKey(card: RawCard, key: string): RawCard {
    const { [key]: _removed, ...rest } = card;
    return rest;
}

describe('generateBatch', () => {
    it('makes exactly one model call and asks for the requested count and topic', async () => {
        const { calls, provider } = buildProvider(() => [boolCard('a')]);
        await generateBatch({ ...languageArgs(provider, buildFakeRunner()), count: 7 });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.count).toBe(7);
        expect(calls[0]?.topic).toBe('strings');
    });

    it('ships a batch prompt template with count and topic placeholders', async () => {
        const template = await readFile(new URL('../../../../prompts/generateBatch.md', import.meta.url), 'utf8');
        expect(template).toContain('COUNT: {{COUNT}}');
        expect(template).toContain('TOPIC: {{TOPIC}}');
    });

    it('keeps valid mc and bool cards with their oracle, rationales, and provenance', async () => {
        const { provider } = buildProvider(() => [mcCard('one', { setupSql: 'SELECT 1' }), boolCard('two')]);
        const result = await generateBatch(languageArgs(provider, buildFakeRunner()));
        expect(result.cards).toHaveLength(2);
        const [mc, bool] = result.cards;
        expect(mc?.oracle).toEqual({ code: "print('x')  # OUT:ans-one", language: 'python', setupSql: 'SELECT 1' });
        expect(mc?.question).toMatchObject({
            answerIndex: 1,
            provenance: {
                model: 'fake-model',
                source: 'generated',
                validation: { method: 'executed', status: 'passed' },
            },
            topic: 'strings',
            type: 'mc',
        });
        expect(bool?.question).toMatchObject({
            answer: true,
            rationale: 'The OR clause makes the WHERE condition always true.',
            type: 'bool',
        });
        expect(bool?.oracle).toEqual({ code: "print('x')  # OUT:True", language: 'python' });
    });

    const goodMcChoices = mcCard('bad').choices as unknown[];

    it.each<[string, RawCard]>([
        ['an mc card with 3 choices', { ...mcCard('bad'), choices: goodMcChoices.slice(0, 3) }],
        ['an mc card with 5 choices', { ...mcCard('bad'), choices: [...goodMcChoices, { rationale: 'r', text: 'x' }] }],
        ['an mc card with no answerIndex', withoutKey(mcCard('bad'), 'answerIndex')],
        ['an mc card with answerIndex out of range', { ...mcCard('bad'), answerIndex: 4 }],
        [
            'an mc card with a wrong choice lacking a rationale',
            {
                ...mcCard('bad'),
                choices: [
                    { text: 'wrong-bad-a' },
                    { text: 'ans-bad' },
                    { rationale: 'r', text: 'b' },
                    { rationale: 'r', text: 'c' },
                ],
            },
        ],
        [
            'an mc card with a rationale over the limit',
            {
                ...mcCard('bad'),
                choices: [
                    { rationale: 'x'.repeat(RATIONALE_LIMIT + 1), text: 'wrong-bad-a' },
                    { text: 'ans-bad' },
                    { rationale: 'r', text: 'b' },
                    { rationale: 'r', text: 'c' },
                ],
            },
        ],
        ['a bool card with no rationale', withoutKey(boolCard('bad'), 'rationale')],
        [
            'a bool card with a rationale over the limit',
            { ...boolCard('bad'), rationale: 'x'.repeat(RATIONALE_LIMIT + 1) },
        ],
        ['a bool card with no answer', withoutKey(boolCard('bad'), 'answer')],
        ['a card with no oracle', withoutKey(boolCard('bad'), 'oracle')],
        ['a card with an empty oracle code', { ...boolCard('bad'), oracle: { code: '' } }],
        ['a card of an unknown type', { ...boolCard('bad'), type: 'ab' }],
        ['a card with no prompt', withoutKey(boolCard('bad'), 'prompt')],
        ['a card that is not an object', 'just text' as unknown as RawCard],
    ])('drops %s without running it and keeps the valid card beside it', async (_name, bad) => {
        const { calls, provider } = buildProvider(() => [bad, boolCard('good')]);
        const runner = buildFakeRunner();
        const result = await generateBatch(languageArgs(provider, runner));
        expect(result.cards.map(({ question }) => question.prompt)).toEqual(['Does payload good return every row?']);
        // Only the valid card reached the sandbox.
        expect(runner.oracles.length).toBeGreaterThan(0);
        expect(runner.oracles.every(({ code }) => code.includes('OUT:True'))).toBe(true);
        expect(calls).toHaveLength(1);
    });

    it('drops a topic card whose runner is outside the track list, or missing, without running it', async () => {
        const { provider } = buildProvider(() => [
            boolCard('ruby', { language: 'ruby' }),
            boolCard('none'),
            boolCard('good', { language: 'node' }),
        ]);
        const runner = buildFakeRunner();
        const result = await generateBatch(topicArgs(provider, runner));
        expect(result.cards.map(({ question }) => question.prompt)).toEqual(['Does payload good return every row?']);
        expect(result.cards[0]?.oracle.language).toBe('node');
        expect(runner.oracles.length).toBeGreaterThan(0);
        expect(runner.oracles.every(({ language }) => language === 'node')).toBe(true);
    });

    it('gives a topic card the grammar of its runner', async () => {
        const { provider } = buildProvider(() => [
            boolCard('py', { language: 'python' }),
            boolCard('db', { language: 'postgres' }),
        ]);
        const result = await generateBatch(topicArgs(provider, buildFakeRunner()));
        expect(result.cards.map(({ question }) => (question as { grammar?: string }).grammar)).toEqual([
            'python',
            'sql',
        ]);
    });

    it('drops a card whose oracle output does not prove the claimed answer, with no further model call', async () => {
        const { calls, provider } = buildProvider(() => [
            boolCard('wrong', { answer: false }),
            { ...mcCard('wrong2'), answerIndex: 0 },
            boolCard('good'),
        ]);
        const result = await generateBatch(languageArgs(provider, buildFakeRunner()));
        expect(result.cards.map(({ question }) => question.prompt)).toEqual(['Does payload good return every row?']);
        expect(result.drops['answer-mismatch']).toBe(2);
        expect(calls).toHaveLength(1);
    });

    it('drops a card duplicating an existing prompt and a card repeating an earlier card of the batch', async () => {
        const { provider } = buildProvider(() => [
            boolCard('existing'),
            boolCard('fresh'),
            { ...boolCard('other'), prompt: 'DOES payload fresh return every row' },
        ]);
        const result = await generateBatch({
            ...languageArgs(provider, buildFakeRunner()),
            existingPrompts: new Set([normalizePrompt('Does payload existing return every row?')]),
        });
        expect(result.cards.map(({ question }) => question.prompt)).toEqual(['Does payload fresh return every row?']);
        expect(result.drops.duplicate).toBe(2);
    });

    it('lets any other provider error propagate', async () => {
        const { provider } = buildProvider(() => {
            throw new Error('claude binary missing');
        });
        await expect(generateBatch(languageArgs(provider, buildFakeRunner()))).rejects.toThrow('claude binary missing');
    });
});
