import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TARGET_QUESTIONS_PER_TOPIC } from '../../services/gapFill/TARGET_QUESTIONS_PER_TOPIC.js';
import { fillBank } from '../../services/gapFill/fillBank.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import { ProviderTransientError } from '../../types/ProviderTransientError.js';

function buildCard(tag: string) {
    return {
        answerIndex: 1,
        choices: [
            { rationale: 'Counts bytes, not characters.', text: '2' },
            { text: '3' },
            { rationale: 'Counts the quotes too.', text: '5' },
            { rationale: 'Counts the quotes only.', text: 'two' },
        ],
        oracle: { code: 'print(len("abc"))' },
        prompt: `For example ${tag}, what does len of abc return?`,
        query: { explanation: 'len counts characters.', title: 'len counts characters' },
        type: 'mc',
    };
}

// Answers each model call with the cards (or throws the error) the script returns for the
// call's topic and call index.
function scripted(next: (topic: string, call: number) => unknown[]): ModelProvider {
    let call = 0;
    return {
        async generate(request: { prompt: string }) {
            const topic = /TOPIC: (\S+)/.exec(request.prompt)?.[1] ?? 'none';
            return { model: 'fake-model', value: { cards: next(topic, call++) } };
        },
    } as unknown as ModelProvider;
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
            topics: ['strings', 'lists'],
        });
    }

    async function readStaged() {
        return JSON.parse(await readFile(join(outRoot, 'generated', 'python', 'easy.json'), 'utf8')) as {
            questions: { prompt: string; topic: string }[];
            schemaVersion: number;
        };
    }

    it('drops a batch on a model timeout, counts and logs it, and stages the next topic', async () => {
        const provider = scripted((topic, call) => {
            if (topic === 'strings') {
                throw new ProviderTransientError('model-timeout', 'claude timed out after 300000 ms');
            }
            return Array.from({ length: TARGET_QUESTIONS_PER_TOPIC }, (_unused, index) =>
                buildCard(`${call}-${index}`),
            );
        });

        await expect(fill(provider)).resolves.toEqual({
            duplicate: 0,
            failed: TARGET_QUESTIONS_PER_TOPIC,
            generated: TARGET_QUESTIONS_PER_TOPIC,
        });
        expect(logs.join('\n')).toContain('model-timeout');
        const staged = await readStaged();
        expect(staged.schemaVersion).toBe(2);
        expect(staged.questions).toHaveLength(TARGET_QUESTIONS_PER_TOPIC);
        expect(staged.questions.every(({ topic }) => topic === 'lists')).toBe(true);
    });
});
