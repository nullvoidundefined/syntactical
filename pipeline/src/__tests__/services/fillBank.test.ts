import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_CONSECUTIVE_PROVIDER_FAILURES } from '../../services/gapFill/MAX_CONSECUTIVE_PROVIDER_FAILURES.js';
import { TARGET_QUESTIONS_PER_TOPIC } from '../../services/gapFill/TARGET_QUESTIONS_PER_TOPIC.js';
import { fillBank } from '../../services/gapFill/fillBank.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import { ProviderTransientError } from '../../types/ProviderTransientError.js';

function buildDraft(call: number) {
    return {
        question: {
            answerIndex: 1,
            choices: [{ text: '2' }, { text: '3' }, { text: '4' }],
            code: 'len("abc")',
            oracle: { code: 'print(len("abc"))' },
            prompt: `For example ${call}, what does len of abc return?`,
            query: { explanation: 'len counts characters.', title: 'len counts characters' },
            type: 'mc',
        },
    };
}

function scripted(next: (call: number) => ReturnType<typeof buildDraft>): ModelProvider {
    let call = 0;
    return {
        async generate(request) {
            const reply = next(call++);
            return { model: 'fake-model', value: request.schema.parse(reply) };
        },
    };
}

describe('fillBank', () => {
    let outRoot: string;
    let logs: string[];

    beforeEach(async () => {
        outRoot = await mkdtemp(join(tmpdir(), 'fill-bank-transient-'));
        logs = [];
        const classificationsDir = join(outRoot, 'classifications', 'python');
        await mkdir(classificationsDir, { recursive: true });
        await writeFile(join(classificationsDir, 'easy.json'), '{}');
    });

    afterEach(async () => {
        await rm(outRoot, { force: true, recursive: true });
    });

    function fill(provider: ModelProvider) {
        return fillBank({
            bankKey: 'python/easy',
            difficulty: 'easy',
            language: 'python',
            languageId: 'python',
            log: (line) => logs.push(line),
            outRoot,
            provider,
            questions: [],
            run: async () => ({ outcome: 'value', runtimeVersion: '3.12.1', value: '3' }),
            topics: ['strings'],
        });
    }

    async function readStaged() {
        return JSON.parse(await readFile(join(outRoot, 'generated', 'python', 'easy.json'), 'utf8')) as {
            questions: { prompt: string; topic: string }[];
            schemaVersion: number;
        };
    }

    it('continues after a model timeout, counts and logs the drop, and stages later questions', async () => {
        const provider = scripted((call) => {
            if (call === 0) {
                throw new ProviderTransientError('model-timeout', 'claude timed out after 300000 ms');
            }
            return buildDraft(call);
        });

        await expect(fill(provider)).resolves.toEqual({
            duplicate: 0,
            failed: 1,
            generated: TARGET_QUESTIONS_PER_TOPIC - 1,
        });
        expect(logs.join('\n')).toContain('dropped (model-timeout)');
        const staged = await readStaged();
        expect(staged.schemaVersion).toBe(2);
        expect(staged.questions.map(({ prompt }) => prompt)).toEqual(
            Array.from({ length: TARGET_QUESTIONS_PER_TOPIC - 1 }, (_, index) => buildDraft(index + 1).question.prompt),
        );
        expect(staged.questions.every(({ topic }) => topic === 'strings')).toBe(true);
    });

    it('aborts at five consecutive provider failures and stages questions kept before the streak', async () => {
        expect(MAX_CONSECUTIVE_PROVIDER_FAILURES).toBe(5);
        const provider = scripted((call) => {
            if (call > 0 && call <= MAX_CONSECUTIVE_PROVIDER_FAILURES) {
                const reason = call % 2 === 0 ? 'model-error' : 'model-timeout';
                throw new ProviderTransientError(reason, `provider failed on draft ${call}`);
            }
            return buildDraft(call);
        });

        await expect(fill(provider)).rejects.toThrow(/5 consecutive/);
        const staged = await readStaged();
        expect(staged.schemaVersion).toBe(2);
        expect(staged.questions.map(({ prompt }) => prompt)).toEqual([buildDraft(0).question.prompt]);
    });

    it('resets consecutive provider failures after each kept question and completes interleaved streaks', async () => {
        const provider = scripted((call) => {
            if ((call + 1) % MAX_CONSECUTIVE_PROVIDER_FAILURES !== 0) {
                const reason = call % 2 === 0 ? 'model-timeout' : 'model-error';
                throw new ProviderTransientError(reason, `provider failed on draft ${call}`);
            }
            return buildDraft(call);
        });
        const keptCalls = Array.from({ length: TARGET_QUESTIONS_PER_TOPIC }, (_, index) => index).filter(
            (call) => (call + 1) % MAX_CONSECUTIVE_PROVIDER_FAILURES === 0,
        );

        await expect(fill(provider)).resolves.toEqual({
            duplicate: 0,
            failed: TARGET_QUESTIONS_PER_TOPIC - keptCalls.length,
            generated: keptCalls.length,
        });
        const staged = await readStaged();
        expect(staged.questions.map(({ prompt }) => prompt)).toEqual(
            keptCalls.map((call) => buildDraft(call).question.prompt),
        );
    });
});
