// `pipeline gap-fill` batch generation: one model call per short topic (at most 2 per run),
// cards proven in the sandbox, staging complete enough that publish needs no enrich. Fake
// provider, fake runner, fake judge; no Docker, no network.
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { validateBankForPublish, type Question } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gapFill } from '../../commands/gapFill.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import { ProviderTransientError } from '../../types/ProviderTransientError.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleRun } from '../../types/OracleRun.js';

const HASH = '0123456789abcdef'.repeat(4);
const PAID_MARKER = 'PAID-BATCH-MARKER';
const TARGET = 10;

type RawCard = Record<string, unknown>;
type Kind = 'language' | 'topic';
interface Call {
    count: number;
    n: number;
    prompt: string;
    topic: string;
}

function buildOracle(output: string, language?: string, setupSql?: string): Record<string, unknown> {
    return {
        code: `print('x')  # OUT:${output}`,
        ...(language === undefined ? {} : { language }),
        ...(setupSql === undefined ? {} : { setupSql }),
    };
}

function boolCard(tag: string, extra: { answer?: boolean; language?: string; marker?: string } = {}): RawCard {
    return {
        answer: extra.answer ?? true,
        oracle: buildOracle('True', extra.language),
        prompt: `Does payload ${tag} ${extra.marker ?? ''} return every row?`,
        query: { explanation: 'e', title: 't' },
        rationale: 'The OR clause makes the WHERE condition always true.',
        type: 'bool',
    };
}

function mcCard(tag: string, language?: string, setupSql?: string): RawCard {
    return {
        answerIndex: 1,
        choices: [
            { rationale: 'Tempting but it never runs.', text: `wrong-${tag}-a` },
            { text: `ans-${tag}` },
            { rationale: 'Tempting but it throws.', text: `wrong-${tag}-b` },
            { rationale: 'Tempting but it is empty.', text: `wrong-${tag}-c` },
        ],
        oracle: buildOracle(`ans-${tag}`, language, setupSql),
        prompt: `Which output does case ${tag} print?`,
        query: { explanation: 'e', title: 't' },
        type: 'mc',
    };
}

async function writeJson(path: string, body: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(body));
}

async function readJson<T = Record<string, unknown>>(path: string): Promise<T> {
    return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function listFiles(dir: string): Promise<string[]> {
    const names = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
    const files: string[] = [];
    for (const name of names) {
        if (!(await stat(join(dir, name))).isDirectory()) files.push(name);
    }
    return files.sort();
}

interface Seed {
    access?: 'free' | 'paid';
    // Existing bank questions: [prompt, topic].
    bank?: [string, string][];
    kind?: Kind;
    staged?: { id: string; prompt: string; topic: string }[];
    topics?: string[];
}

describe('gapFill batch generation', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    let logs: string[];
    let ranOracles: Oracle[];
    let judgeCalls: string[];
    let id: string;
    let outRoot: string;

    // The fake provider returns its value unparsed; the topic and count come from the prompt's
    // `TOPIC: <id>` and `COUNT: <n>` lines.
    function buildProvider(script: (call: Call) => RawCard[]): ModelProvider & { calls: Call[] } {
        const calls: Call[] = [];
        return {
            calls,
            async generate(request: { prompt: string }) {
                const { prompt } = request;
                const call = {
                    count: Number(/COUNT: (\d+)/.exec(prompt)?.[1] ?? 0),
                    n: calls.length + 1,
                    prompt,
                    topic: /TOPIC: (\S+)/.exec(prompt)?.[1] ?? 'none',
                };
                calls.push(call);
                return { model: 'fake-model', value: { cards: script(call) } };
            },
        } as unknown as ModelProvider & { calls: Call[] };
    }

    function buildJudge() {
        return new Proxy(
            {},
            {
                get(_target, name) {
                    return async () => {
                        judgeCalls.push(String(name));
                    };
                },
            },
        );
    }

    function run(provider: ModelProvider, withJudge = false) {
        return gapFill({
            contentDir,
            contentRoot,
            log: (line) => logs.push(line),
            newRunId: () => 'run-1',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
            provider,
            run: async (oracle): Promise<OracleRun> => {
                ranOracles.push(oracle);
                const value = /OUT:(.*)$/.exec(oracle.code)?.[1]?.trim() ?? '';
                return { outcome: 'value', runtimeVersion: 'Python 3.13.1', value };
            },
            ...(withJudge ? ({ judge: buildJudge() } as never) : {}),
        });
    }

    async function seed(options: Seed = {}): Promise<void> {
        const { access = 'free', bank = [], kind = 'language', staged = [], topics = ['strings'] } = options;
        id = kind === 'topic' ? 'backend-security' : 'python';
        const productId = access === 'paid' ? { productId: `syntactical.${id}.easy` } : {};
        const entry = {
            banks: {
                easy: { access, contentVersion: 1, hash: HASH, path: `${id}/easy.json`, topicCounts: {}, ...productId },
            },
            glyph: 'G',
            grammar: 'plain',
            id,
            label: id,
            misconceptions: [],
            tagline: 'T',
            topics: topics.map((topic) => ({ id: topic, label: topic })),
            ...(kind === 'topic' ? { kind: 'topic' } : {}),
        };
        outRoot = access === 'free' ? pipelineDir : contentRoot;
        const questions = bank.map(([prompt], index) => ({ answer: true, id: `bank-${index}`, prompt, type: 'bool' }));
        await writeJson(join(contentDir, 'manifest.json'), { languages: [entry], schemaVersion: 2 });
        await writeJson(join(access === 'free' ? contentDir : contentRoot, `${id}/easy.json`), {
            questions,
            schemaVersion: 2,
        });
        await writeJson(
            join(outRoot, `classifications/${id}/easy.json`),
            Object.fromEntries(bank.map(([, topic], index) => [`bank-${index}`, { confidence: 0.9, topic }])),
        );
        if (staged.length > 0) {
            await writeJson(join(outRoot, `generated/${id}/easy.json`), {
                questions: staged.map(({ id: stagedId, prompt, topic }) => ({
                    answer: true,
                    id: stagedId,
                    prompt,
                    topic,
                    type: 'bool',
                })),
                schemaVersion: 2,
            });
        }
    }

    // `n` distinct valid bool cards, tagged `<prefix><i>`.
    function validCards(n: number, prefix: string, language?: string): RawCard[] {
        return Array.from({ length: n }, (_unused, index) => boolCard(`${prefix}${index}`, { language }));
    }

    function existingBankOf(n: number, topic: string): [string, string][] {
        return Array.from({ length: n }, (_unused, index) => [`Existing ${topic} question ${index}?`, topic]);
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'gap-fill-batch-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeJson(join(pipelineDir, 'topics.json'), {});
        logs = [];
        ranOracles = [];
        judgeCalls = [];
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    describe('call budget', () => {
        it('makes one call asking for the full target when the topic is empty', async () => {
            await seed();
            const provider = buildProvider(({ count }) => validCards(count, 'a'));
            await run(provider);
            expect(provider.calls).toHaveLength(1);
            expect(provider.calls[0]?.count).toBe(TARGET);
            expect(provider.calls[0]?.topic).toBe('strings');
        });

        it('asks for exactly the number of cards the topic is short', async () => {
            await seed({ bank: existingBankOf(7, 'strings') });
            const provider = buildProvider(({ count }) => validCards(count, 'a'));
            await run(provider);
            expect(provider.calls).toHaveLength(1);
            expect(provider.calls[0]?.count).toBe(3);
            const staged = await readJson<{ questions: unknown[] }>(join(outRoot, `generated/${id}/easy.json`));
            expect(staged.questions).toHaveLength(3);
        });

        it('makes a second call for the remainder when the first batch left the topic short', async () => {
            await seed();
            const provider = buildProvider(({ n }) => (n === 1 ? validCards(4, 'a') : validCards(6, 'b')));
            await run(provider);
            expect(provider.calls.map(({ count }) => count)).toEqual([10, 6]);
            const staged = await readJson<{ questions: unknown[] }>(join(outRoot, `generated/${id}/easy.json`));
            expect(staged.questions).toHaveLength(TARGET);
        });

        it('stops after 2 calls for a topic even when the topic is still short', async () => {
            await seed();
            // A bool card that claims the wrong answer never proves out.
            const provider = buildProvider(({ count }) =>
                Array.from({ length: count }, (_unused, index) => boolCard(`bad${index}`, { answer: false })),
            );
            await run(provider);
            expect(provider.calls).toHaveLength(2);
        });

        it('makes no second call when the first batch filled the topic', async () => {
            await seed({ bank: existingBankOf(5, 'strings') });
            const provider = buildProvider(({ count }) => validCards(count, 'a'));
            await run(provider);
            expect(provider.calls).toHaveLength(1);
        });

        it('budgets calls per topic', async () => {
            await seed({ topics: ['strings', 'lists'] });
            // Each topic's cards get their own prompts, so the duplicate filter keeps them all.
            const provider = buildProvider(({ count, topic }) => validCards(count, topic));
            await run(provider);
            expect(provider.calls.map(({ topic }) => topic)).toEqual(['strings', 'lists']);
        });
    });

    describe('card validation', () => {
        it('drops cards missing rationales, choices, or oracle without running them', async () => {
            await seed();
            const { oracle: _oracle, ...noOracle } = boolCard('noorc');
            const { rationale: _rationale, ...noRationale } = boolCard('norat');
            const provider = buildProvider(({ n }) => (n === 1 ? [noOracle, noRationale, boolCard('good')] : []));
            await run(provider);
            const staged = await readJson<{ questions: { prompt: string }[] }>(
                join(outRoot, `generated/${id}/easy.json`),
            );
            expect(staged.questions.map(({ prompt }) => prompt)).toEqual(['Does payload good  return every row?']);
            expect(ranOracles.every(({ code }) => code.includes('OUT:True'))).toBe(true);
            expect(ranOracles).toHaveLength(3);
        });

        it('drops a topic card naming a runner outside the track list without running it', async () => {
            await seed({ kind: 'topic' });
            const provider = buildProvider(({ n }) =>
                n === 1 ? [boolCard('rb', { language: 'ruby' }), boolCard('ok', { language: 'python' })] : [],
            );
            await run(provider);
            const staged = await readJson<{ questions: { prompt: string }[] }>(
                join(outRoot, `generated/${id}/easy.json`),
            );
            expect(staged.questions).toHaveLength(1);
            expect(ranOracles.every(({ language }) => language === 'python')).toBe(true);
            expect(ranOracles).toHaveLength(3);
        });

        it('drops a card whose oracle output does not prove its answer, with no model call for it', async () => {
            await seed();
            const provider = buildProvider(({ n }) =>
                n === 1 ? [boolCard('bad', { answer: false }), boolCard('good')] : [],
            );
            await run(provider);
            const staged = await readJson<{ questions: { prompt: string }[] }>(
                join(outRoot, `generated/${id}/easy.json`),
            );
            expect(staged.questions).toHaveLength(1);
            // 1 batch, plus the one allowed remainder call; never a call to repair the bad card.
            expect(provider.calls).toHaveLength(2);
            expect(provider.calls[1]?.prompt).not.toContain('Does payload bad');
        });
    });

    describe('provider failures', () => {
        it.each([
            ['ModelOutputInvalid', () => new ModelOutputInvalid('generate-batch-v1', 'not json')],
            ['ProviderTransientError', () => new ProviderTransientError('model-timeout', 'timed out')],
        ])('drops the batch on %s and continues with the next topic', async (_name, makeError) => {
            await seed({ topics: ['strings', 'lists'] });
            const provider = buildProvider((call) => {
                if (call.topic === 'strings') throw makeError();
                return validCards(call.count, 'b');
            });
            const report = await run(provider);
            expect(provider.calls.map(({ topic }) => topic)).toEqual(['strings', 'lists']);
            const staged = await readJson<{ questions: { topic: string }[] }>(
                join(outRoot, `generated/${id}/easy.json`),
            );
            expect(staged.questions).toHaveLength(TARGET);
            expect(staged.questions.every(({ topic }) => topic === 'lists')).toBe(true);
            expect(report.counts).toMatchObject({ 'gap-fill-generated': TARGET });
        });

        it('stops the run on any other error', async () => {
            await seed({ topics: ['strings', 'lists'] });
            const provider = buildProvider(() => {
                throw new Error('claude binary missing');
            });
            await expect(run(provider)).rejects.toThrow('claude binary missing');
            expect(provider.calls).toHaveLength(1);
        });
    });

    describe('staging', () => {
        it.each<Kind>(['language', 'topic'])(
            'stages %s cards with rationales, executed provenance, and oracles so publish needs no enrich',
            async (kind) => {
                await seed({ kind });
                const language = kind === 'topic' ? 'python' : undefined;
                const provider = buildProvider(({ n }) =>
                    n === 1 ? [mcCard('m1', language), mcCard('m2', language), ...validCards(8, 'b', language)] : [],
                );
                await run(provider);
                const staged = await readJson<{ questions: Question[] }>(join(outRoot, `generated/${id}/easy.json`));
                const oracles = await readJson<Record<string, Oracle>>(join(outRoot, `oracles/${id}/easy.json`));
                expect(staged.questions).toHaveLength(TARGET);
                expect(Object.keys(oracles).sort()).toEqual(staged.questions.map((question) => question.id).sort());
                for (const question of staged.questions) {
                    expect(question.provenance).toMatchObject({
                        model: 'fake-model',
                        promptVersion: expect.any(String),
                        source: 'generated',
                        validation: { method: 'executed', status: 'passed' },
                    });
                    expect(oracles[question.id]?.language).toBe('python');
                    if (kind === 'topic') expect(question).toMatchObject({ grammar: 'python' });
                }
                const mc = staged.questions.find((question) => question.type === 'mc');
                expect(mc).toMatchObject({ answerIndex: 1 });
                const { problems } = validateBankForPublish(
                    { questions: staged.questions },
                    { misconceptionIds: [], topicIds: ['strings'] },
                );
                expect(problems).toEqual([]);
            },
        );

        it('gives a topic card the grammar of its runner and keeps its setupSql in the oracle', async () => {
            await seed({ kind: 'topic' });
            const card = { ...mcCard('db', 'postgres', 'SELECT 1') };
            const provider = buildProvider(({ n }) => (n === 1 ? [card] : []));
            await run(provider);
            const staged = await readJson<{ questions: Question[] }>(join(outRoot, `generated/${id}/easy.json`));
            const oracles = await readJson<Record<string, Oracle>>(join(outRoot, `oracles/${id}/easy.json`));
            expect(staged.questions[0]).toMatchObject({ grammar: 'sql' });
            const [question] = staged.questions as [Question];
            expect(oracles[question.id]).toEqual({
                code: "print('x')  # OUT:ans-db",
                language: 'postgres',
                setupSql: 'SELECT 1',
            });
        });

        it('keeps paid output under the content root and nothing of it under pipelineDir', async () => {
            await seed({ access: 'paid' });
            const provider = buildProvider(({ count }) =>
                Array.from({ length: count }, (_unused, index) => boolCard(`p${index}`, { marker: PAID_MARKER })),
            );
            await run(provider);
            expect(outRoot).toBe(contentRoot);
            const staged = await readJson<{ questions: { id: string }[] }>(
                join(contentRoot, `generated/${id}/easy.json`),
            );
            expect(staged.questions).toHaveLength(TARGET);
            const oracles = await readJson(join(contentRoot, `oracles/${id}/easy.json`));
            expect(Object.keys(oracles).sort()).toEqual(staged.questions.map((question) => question.id).sort());
            for (const name of await listFiles(pipelineDir)) {
                const text = await readFile(join(pipelineDir, name), 'utf8');
                expect(text).not.toContain(PAID_MARKER);
                for (const { id: questionId } of staged.questions) expect(text).not.toContain(questionId);
            }
            expect(await listFiles(join(pipelineDir, 'oracles'))).toEqual([]);
            expect(await listFiles(join(pipelineDir, 'generated'))).toEqual([]);
        });
    });

    describe('duplicates', () => {
        it('drops cards duplicating a bank prompt, a staged prompt, or an earlier card of the batch', async () => {
            await seed({
                bank: [['Does payload bankdup  return every row?', 'other']],
                staged: [{ id: 'gen-old', prompt: 'does payload stageddup return every row', topic: 'other' }],
            });
            const provider = buildProvider(({ n }) =>
                n === 1
                    ? [
                          boolCard('bankdup'),
                          boolCard('stageddup'),
                          boolCard('fresh'),
                          { ...boolCard('fresh2'), prompt: 'DOES payload fresh  return every row' },
                      ]
                    : [],
            );
            await run(provider);
            const staged = await readJson<{ questions: { id: string; prompt: string }[] }>(
                join(outRoot, `generated/${id}/easy.json`),
            );
            expect(staged.questions.map(({ prompt }) => prompt)).toEqual([
                'does payload stageddup return every row',
                'Does payload fresh  return every row?',
            ]);
        });
    });

    describe('no per-card loop and no judged route', () => {
        it('never calls the judge, even for a topic track, and sends no revision or execute prompts', async () => {
            await seed({ kind: 'topic' });
            const provider = buildProvider(({ count }) =>
                Array.from({ length: count }, (_unused, index) =>
                    boolCard(`bad${index}`, { answer: false, language: 'python' }),
                ),
            );
            await run(provider, true);
            expect(judgeCalls).toEqual([]);
            expect(provider.calls).toHaveLength(2);
            for (const { prompt } of provider.calls) {
                expect(prompt).not.toMatch(/rejected|executed program|"execute"|notExecutable/);
            }
            // 10 bad cards per batch, each validated once (3 sandbox runs), never re-drafted.
            expect(ranOracles.length).toBeLessThanOrEqual(2 * TARGET * 3);
        });
    });

    describe('logging', () => {
        it('logs one line per batch with requested, kept, and drops by reason', async () => {
            await seed({ bank: [['Existing dup?', 'other']] });
            const provider = buildProvider(({ n }) =>
                n === 1
                    ? [
                          ...validCards(7, 'a'),
                          boolCard('m1', { answer: false }),
                          boolCard('m2', { answer: false }),
                          { ...boolCard('d'), prompt: 'EXISTING dup' },
                      ]
                    : [],
            );
            await run(provider);
            const lines = logs.filter((line) => line.startsWith('python/easy strings: batch of'));
            expect(lines).toHaveLength(2);
            expect(lines[0]).toContain('python/easy strings: batch of 10, kept 7');
            expect(lines[0]).toMatch(/answer-mismatch\D*2/);
            expect(lines[0]).toMatch(/duplicate\D*1/);
            expect(lines[1]).toContain('python/easy strings: batch of 3, kept 0');
        });
    });
});
