// gap-fill keeps each kept question's oracle in `<outRoot>/oracles/<language>/<difficulty>.json`
// (question id to oracle), merging with what is already there. A paid bank's oracles live under
// the content root and nothing of a paid bank reaches the public pipeline dir. Fake provider and
// fake runner, no Docker.
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gapFill } from '../../commands/gapFill.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);
const PAID_MARKER = 'PAID-ORACLE-MARKER';
const GENERATED_PER_EMPTY_TOPIC = 10;

type Kind = 'language' | 'topic';

function languageDraft(call: number, marker: string): Record<string, unknown> {
    return {
        question: {
            answer: true,
            oracle: { code: `print(True)  # call ${call}`, setupSql: 'SELECT 1' },
            prompt: `Language question number ${call} ${marker}?`,
            query: { explanation: 'e', title: 't' },
            type: 'bool',
        },
    };
}

function topicDraft(call: number, marker: string): Record<string, unknown> {
    return {
        question: {
            answer: true,
            oracle: { code: `print(True)  # call ${call}`, language: 'python' },
            prompt: `Does payload number ${call} ${marker} return every row?`,
            query: { explanation: 'e', title: 't' },
            rationale: 'The OR clause makes the WHERE condition always true.',
            type: 'bool',
        },
    };
}

async function writeJson(path: string, body: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(body));
}

async function readJson(path: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

async function listFiles(dir: string): Promise<string[]> {
    const names = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
    const files: string[] = [];
    for (const name of names) {
        if (!(await stat(join(dir, name))).isDirectory()) {
            files.push(name);
        }
    }
    return files.sort();
}

describe('gapFill oracles', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;

    function run(kind: Kind, marker = 'plain') {
        let calls = 0;
        const provider = {
            async generate(request: { schema: { parse: (value: unknown) => unknown } }) {
                calls += 1;
                const draft = kind === 'topic' ? topicDraft(calls, marker) : languageDraft(calls, marker);
                return { model: 'fake-model', value: request.schema.parse(draft) };
            },
        } as unknown as ModelProvider;
        return gapFill({
            contentDir,
            contentRoot,
            log: () => undefined,
            newRunId: () => 'run-1',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
            provider,
            run: async () => ({ outcome: 'value', runtimeVersion: 'Python 3.13.1', value: 'True' }),
        });
    }

    // One empty bank for `kind`; `access` decides where the bank, classifications, and output live.
    async function seed(kind: Kind, access: 'free' | 'paid'): Promise<{ id: string; outRoot: string }> {
        const id = kind === 'topic' ? 'backend-security' : 'python';
        const topic = kind === 'topic' ? 'sql-injection' : 'strings';
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
            topics: [{ id: topic, label: topic }],
            ...(kind === 'topic' ? { kind: 'topic' } : {}),
        };
        const outRoot = access === 'free' ? pipelineDir : contentRoot;
        await writeJson(join(contentDir, 'manifest.json'), { languages: [entry], schemaVersion: 2 });
        await writeJson(join(access === 'free' ? contentDir : contentRoot, `${id}/easy.json`), {
            questions: [],
            schemaVersion: 2,
        });
        await writeJson(join(outRoot, `classifications/${id}/easy.json`), {});
        return { id, outRoot };
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'gap-fill-oracles-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeJson(join(pipelineDir, 'topics.json'), {});
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('writes the oracle of each kept language-route question next to the generated file', async () => {
        const { id, outRoot } = await seed('language', 'free');
        await run('language');
        const staged = (await readJson(join(outRoot, `generated/${id}/easy.json`))) as { questions: { id: string }[] };
        const oracles = await readJson(join(outRoot, `oracles/${id}/easy.json`));
        expect(staged.questions).toHaveLength(GENERATED_PER_EMPTY_TOPIC);
        expect(Object.keys(oracles).sort()).toEqual(staged.questions.map((question) => question.id).sort());
        expect(oracles[staged.questions[0]?.id as string]).toEqual({
            code: 'print(True)  # call 1',
            language: 'python',
            setupSql: 'SELECT 1',
        });
    });

    it('writes the oracle of each kept topic-route question with the runner the draft chose', async () => {
        const { id, outRoot } = await seed('topic', 'free');
        await run('topic');
        const staged = (await readJson(join(outRoot, `generated/${id}/easy.json`))) as { questions: { id: string }[] };
        const oracles = await readJson(join(outRoot, `oracles/${id}/easy.json`));
        expect(Object.keys(oracles).sort()).toEqual(staged.questions.map((question) => question.id).sort());
        expect(oracles[staged.questions[0]?.id as string]).toEqual({
            code: 'print(True)  # call 1',
            language: 'python',
        });
    });

    it('merges new oracles into the entries already in the file', async () => {
        const { id, outRoot } = await seed('language', 'free');
        const earlier = { 'earlier-question': { code: 'print(1)', language: 'python' } };
        await writeJson(join(outRoot, `oracles/${id}/easy.json`), earlier);
        await run('language');
        const oracles = await readJson(join(outRoot, `oracles/${id}/easy.json`));
        expect(oracles['earlier-question']).toEqual(earlier['earlier-question']);
        expect(Object.keys(oracles)).toHaveLength(GENERATED_PER_EMPTY_TOPIC + 1);
    });

    it.each<Kind>(['language', 'topic'])(
        'puts a paid %s bank oracles under the content root and nothing of the bank under pipeline/',
        async (kind) => {
            const { id, outRoot } = await seed(kind, 'paid');
            await run(kind, PAID_MARKER);
            expect(outRoot).toBe(contentRoot);
            const staged = (await readJson(join(contentRoot, `generated/${id}/easy.json`))) as {
                questions: { id: string }[];
            };
            const oracles = await readJson(join(contentRoot, `oracles/${id}/easy.json`));
            expect(Object.keys(oracles).sort()).toEqual(staged.questions.map((question) => question.id).sort());
            for (const name of await listFiles(pipelineDir)) {
                const text = await readFile(join(pipelineDir, name), 'utf8');
                expect(text).not.toContain(PAID_MARKER);
                for (const { id: questionId } of staged.questions) {
                    expect(text).not.toContain(questionId);
                }
            }
            expect(await listFiles(join(pipelineDir, 'oracles'))).toEqual([]);
        },
    );
});
