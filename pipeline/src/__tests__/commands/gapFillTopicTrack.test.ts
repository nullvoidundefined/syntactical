// gap-fill sends an entry with kind 'topic' to topic generation with its TRACK_RUNNERS, and
// never sends a language id through it; an entry without kind stays a language. Fake provider
// and fake runner, no Docker.
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gapFill } from '../../commands/gapFill.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import { writeJson } from '../fixtures/jsonFiles.js';
import { buildBankEntry, buildLanguage } from '../fixtures/manifest.js';

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

function buildEntry(id: string, extra: Record<string, unknown>): Record<string, unknown> {
    return buildLanguage({
        banks: { easy: buildBankEntry(`${id}/easy.json`) },
        id,
        label: id,
        topics: [{ id: 'sql-injection', label: 'SQL injection' }],
        ...extra,
    });
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

    it('skips a topic bank with no classifications file', async () => {
        await seed([buildEntry('backend-security', { kind: 'topic' })], false);
        await run();
        expect(logs).toContain('skipping bank backend-security/easy: no classifications, run classify first');
    });
});
