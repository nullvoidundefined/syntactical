// gap-fill with the judged route: not-executable topic drafts are judged; a card both models and
// the consistency pass agree on is staged as judged and passed; any other judged failure stages a
// disputed card under the bank's own output root (free under pipeline/, paid under the content
// root, never paid under pipeline/); a source failure drops the draft before any model call; a
// missing Codex stops the run before any model call. Fakes only: no Docker, no network, no codex.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gapFill } from '../../commands/gapFill.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);
const SOURCE = {
    quote: 'Lax cookies are not sent on cross-site POST requests',
    title: 'Using HTTP cookies',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
};
const READY_MESSAGE = 'Codex CLI is not installed or not logged in: run `codex login`';

// Each call drafts a distinct prompt, so no draft is dropped as a duplicate.
function notExecutable(call: number): Record<string, unknown> {
    return {
        notExecutable: {
            question: {
                answer: true,
                grammar: 'plain',
                prompt: `SameSite=Lax withholds the session cookie on cross-site form POST number ${call}.`,
                query: { explanation: 'Lax sends cookies on top-level GET only.', title: 'SameSite=Lax' },
                rationale: 'Lax still sends the cookie on top-level GET, which is why some think it blocks nothing.',
                sources: [SOURCE],
                type: 'bool',
            },
            reason: 'Cookie policy is enforced by the browser.',
        },
    };
}

function judgeWith(claudeAnswer: number, codexAnswer: number, page = `<p>${SOURCE.quote}</p>`) {
    const modelCalls: string[] = [];
    const answer = (index: number) =>
        ({
            async generate(request) {
                modelCalls.push(request.prompt);
                const reply = request.prompt.includes('<quotes>')
                    ? { isConsistent: true, reason: 'Supported.' }
                    : { answerIndex: index };
                return { model: 'fake', value: request.schema.parse(reply) };
            },
        }) as ModelProvider;
    const fetchSource = async (url: string) => ({
        contentType: 'text/html',
        finalUrl: url,
        ok: true as const,
        text: page,
    });
    return { claude: answer(claudeAnswer), codex: answer(codexAnswer), fetchSource, modelCalls };
}

function buildBank(path: string, access: 'free' | 'paid', difficulty: string): Record<string, unknown> {
    const productId = access === 'paid' ? { productId: `syntactical.backend-security.${difficulty}` } : {};
    return { access, contentVersion: 1, hash: HASH, path, topicCounts: {}, ...productId };
}

function buildEntry(id: string, extra: Record<string, unknown>): Record<string, unknown> {
    return {
        banks: {
            easy: buildBank(`${id}/easy.json`, 'free', 'easy'),
            medium: buildBank(`${id}/medium.json`, 'paid', 'medium'),
        },
        glyph: 'G',
        grammar: 'plain',
        id,
        label: id,
        misconceptions: [],
        tagline: 'T',
        topics: [{ id: 'sql-injection', label: 'SQL injection' }],
        ...extra,
    };
}

async function writeJson(path: string, body: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(body));
}

async function readJson(path: string): Promise<any> {
    return JSON.parse(await readFile(path, 'utf8'));
}

async function listFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
    return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

describe('gapFill judged route', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    let prompts: string[];
    let logs: string[];

    const generator: ModelProvider = {
        async generate(request) {
            prompts.push(request.prompt);
            return { model: 'fake-model', value: request.schema.parse(notExecutable(prompts.length)) };
        },
    } as ModelProvider;

    async function seed(entries: Record<string, unknown>[]): Promise<void> {
        await writeJson(join(contentDir, 'manifest.json'), { languages: entries, schemaVersion: 2 });
        for (const { id } of entries as { id: string }[]) {
            await writeJson(join(contentDir, id, 'easy.json'), { questions: [], schemaVersion: 2 });
            await writeJson(join(contentRoot, id, 'medium.json'), { questions: [], schemaVersion: 2 });
            await writeJson(join(pipelineDir, 'classifications', id, 'easy.json'), {});
            await writeJson(join(contentRoot, 'classifications', id, 'medium.json'), {});
        }
    }

    function run(judge?: unknown) {
        return gapFill({
            contentDir,
            contentRoot,
            log: (line) => logs.push(line),
            newRunId: () => 'run-1',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
            provider: generator,
            run: async () => {
                throw new Error('the sandbox must not run for a not-executable draft');
            },
            ...(judge === undefined ? {} : { judge: judge as never }),
        });
    }

    function readyJudge(
        claudeAnswer: number,
        codexAnswer: number,
        extra: { page?: string; assertReady?: () => Promise<void> } = {},
    ) {
        const judge = judgeWith(claudeAnswer, codexAnswer, extra.page);
        return { ...judge, assertReady: extra.assertReady ?? (async () => undefined) };
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'gap-fill-judged-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeJson(join(pipelineDir, 'topics.json'), {});
        prompts = [];
        logs = [];
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('stages disputed cards apart from generated ones and counts them', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })]);
        const report = await run(readyJudge(0, 1));
        const free = await readJson(join(pipelineDir, 'disputed/backend-security/easy.json'));
        expect(free.schemaVersion).toBe(1);
        expect(free.cards).toHaveLength(10);
        for (const card of free.cards) {
            expect(card).toMatchObject({ blindAnswers: { claude: 0, codex: 1 }, claimedIndex: 0 });
        }
        const paid = await readJson(join(contentRoot, 'disputed/backend-security/medium.json'));
        expect(paid.cards).toHaveLength(10);
        const underPipeline = await listFiles(pipelineDir);
        expect(underPipeline.filter((file) => file.includes('medium'))).toEqual([]);
        expect(underPipeline.some((file) => file.includes('generated/backend-security'))).toBe(false);
        expect(report.counts['gap-fill-disputed']).toBe(20);
        expect(report.counts['gap-fill-generated']).toBe(0);
    });

    it('stages a card all three checks pass as judged and passed with its evidence, with no oracle', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })]);
        const report = await run(readyJudge(0, 0));
        const staged = await readJson(join(pipelineDir, 'generated/backend-security/easy.json'));
        expect(staged.questions).toHaveLength(10);
        for (const question of staged.questions) {
            expect(question.provenance.validation).toEqual({
                evidence: { sources: [SOURCE], verdict: 'Supported.' },
                method: 'judged',
                status: 'passed',
            });
        }
        const oracleFile = join(pipelineDir, 'oracles/backend-security/easy.json');
        const oracles = await readJson(oracleFile).catch(() => ({}));
        expect(Object.keys(oracles)).toEqual([]);
        expect(await listFiles(join(pipelineDir, 'disputed'))).toEqual([]);
        expect(report.counts['gap-fill-generated']).toBe(20);
        expect(report.counts['gap-fill-disputed']).toBe(0);
    });

    it('drops every draft whose source fails, with no blind-answer or judge call and nothing staged', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })]);
        const judge = readyJudge(0, 0, { page: '<p>unrelated</p>' });
        const report = await run(judge);
        expect(judge.modelCalls).toEqual([]);
        expect(prompts).toHaveLength(20);
        expect(report.counts['gap-fill-failed']).toBe(20);
        expect(logs).toContain('backend-security/easy sql-injection: dropped (source-unverified)');
        expect(await listFiles(join(pipelineDir, 'disputed'))).toEqual([]);
        expect(await listFiles(join(pipelineDir, 'generated'))).toEqual([]);
        expect(await listFiles(join(contentRoot, 'disputed'))).toEqual([]);
    });

    it('checks the judge once before filling a topic track', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })]);
        let checks = 0;
        await run(
            readyJudge(0, 1, {
                assertReady: async () => {
                    checks += 1;
                },
            }),
        );
        expect(checks).toBe(1);
    });

    it('stops before any model call when Codex is not ready, naming codex login', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })]);
        const judge = readyJudge(0, 0, {
            assertReady: async () => {
                throw new Error(READY_MESSAGE);
            },
        });
        await expect(run(judge)).rejects.toThrow('codex login');
        expect(prompts).toEqual([]);
        expect(judge.modelCalls).toEqual([]);
    });

    it('never checks the judge for a manifest of language tracks only', async () => {
        await seed([buildEntry('python', {})]);
        let checks = 0;
        await run(
            readyJudge(0, 1, {
                assertReady: async () => {
                    checks += 1;
                },
            }),
        ).catch(() => undefined);
        expect(checks).toBe(0);
    });

    it('logs that the judged route is off when no judge is given', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })]);
        const report = await run();
        expect(logs).toContain('judged route off: no judge configured, not-executable drafts are dropped');
        expect(report.counts['gap-fill-failed']).toBe(20);
    });
});
