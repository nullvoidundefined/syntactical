// gap-fill sends an entry with kind 'topic' to topic generation with its TRACK_RUNNERS, and
// never sends a language id through it; an entry without kind stays a language. Fake provider
// and fake runner, no Docker.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gapFill } from '../../commands/gapFill.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const HASH = '0123456789abcdef'.repeat(4);

// Each call drafts a distinct prompt, so no draft is dropped as a duplicate.
function topicDraft(call: number, language = 'python'): Record<string, unknown> {
    return {
        question: {
            answer: true,
            oracle: { code: 'print(True)', language },
            prompt: `Does payload number ${call} return every row?`,
            query: { explanation: 'e', title: 't' },
            rationale: 'The OR clause makes the WHERE condition always true.',
            type: 'bool',
        },
    };
}

// The language-track draft shape: the oracle has no language, the runner comes from the track.
function languageDraft(call: number): Record<string, unknown> {
    return {
        question: {
            answer: true,
            oracle: { code: 'print(True)' },
            prompt: `Language question number ${call}?`,
            query: { explanation: 'e', title: 't' },
            type: 'bool',
        },
    };
}

function buildEntry(id: string, extra: Record<string, unknown>): Record<string, unknown> {
    return {
        banks: { easy: { access: 'free', contentVersion: 1, hash: HASH, path: `${id}/easy.json`, topicCounts: {} } },
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

describe('gapFill topic tracks', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    let prompts: string[];
    let logs: string[];

    function provider(draft: (call: number) => Record<string, unknown>): ModelProvider {
        return {
            async generate(request) {
                prompts.push(request.prompt);
                return { model: 'fake-model', value: request.schema.parse(draft(prompts.length)) };
            },
        } as ModelProvider;
    }

    async function seed(entries: Record<string, unknown>[], withClassifications = true): Promise<void> {
        await writeJson(join(contentDir, 'manifest.json'), { languages: entries, schemaVersion: 2 });
        for (const { id } of entries as { id: string }[]) {
            await writeJson(join(contentDir, id, 'easy.json'), { questions: [], schemaVersion: 2 });
            if (withClassifications) {
                await writeJson(join(pipelineDir, 'classifications', id, 'easy.json'), {});
            }
        }
    }

    function run(draft: (call: number) => Record<string, unknown> = (call) => topicDraft(call)) {
        return gapFill({
            contentDir,
            contentRoot,
            log: (line) => logs.push(line),
            newRunId: () => 'run-1',
            now: () => '2026-10-04T00:00:00.000Z',
            pipelineDir,
            provider: provider(draft),
            run: async () => ({ outcome: 'value', runtimeVersion: 'Python 3.13.1', value: 'True' }),
        });
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'gap-fill-topic-'));
        // Same layout as gapFill.test.ts: the content root sits outside the repo.
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        // gap-fill requires the fallback topic list file even when every entry lists its own topics.
        await writeJson(join(pipelineDir, 'topics.json'), {});
        prompts = [];
        logs = [];
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('fills a topic entry with the security prompt and stages cards with the runner grammar', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })]);
        const report = await run();
        expect(prompts[0]).toContain('ALLOWED RUNNERS: python, node, postgres');
        const staged = JSON.parse(
            await readFile(join(pipelineDir, 'generated', 'backend-security', 'easy.json'), 'utf8'),
        );
        expect(staged.questions).toHaveLength(10);
        expect(staged.questions[0]).toMatchObject({ grammar: 'python', topic: 'sql-injection' });
        expect(report.counts).toMatchObject({ 'gap-fill-generated': 10 });
    });

    it('skips a topic entry that has no TRACK_RUNNERS entry', async () => {
        await seed([buildEntry('mystery-security', { kind: 'topic' })]);
        await run();
        expect(logs).toContain(
            'skipping bank mystery-security/easy: no oracle runner or topic list for language mystery-security',
        );
        expect(prompts).toEqual([]);
    });

    it("never routes a language id marked kind 'topic' through ORACLE_LANGUAGES", async () => {
        await seed([buildEntry('python', { kind: 'topic' })]);
        await run();
        expect(logs).toContain('skipping bank python/easy: no oracle runner or topic list for language python');
        expect(prompts).toEqual([]);
    });

    it('skips backend-security when its entry has no kind (a language without a runner)', async () => {
        await seed([buildEntry('backend-security', {})]);
        await run();
        expect(logs).toContain(
            'skipping bank backend-security/easy: no oracle runner or topic list for language backend-security',
        );
        expect(prompts).toEqual([]);
    });

    it('treats an entry without kind as a language: python fills through ORACLE_LANGUAGES', async () => {
        await seed([buildEntry('python', {})]);
        const report = await run((call) => languageDraft(call));
        expect(prompts).toHaveLength(10);
        expect(prompts[0]).not.toContain('ALLOWED RUNNERS');
        expect(report.counts).toMatchObject({ 'gap-fill-generated': 10 });
    });

    it('counts a draft with a runner outside the track as failed and logs the reason', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })]);
        const report = await run((call) => topicDraft(call, 'ruby'));
        expect(report.counts).toMatchObject({ 'gap-fill-failed': 10, 'gap-fill-generated': 0 });
        expect(logs).toContain('backend-security/easy sql-injection: dropped (disallowed-runner)');
    });

    it('skips a topic bank with no classifications file', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })], false);
        await run();
        expect(logs).toContain('skipping bank backend-security/easy: no classifications, run classify first');
    });
});
