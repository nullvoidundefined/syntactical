// The batch prompt lists the bank's existing prompts as written, so the model sees real wording
// (case, identifiers, punctuation) when it avoids repeats; duplicate detection stays normalized.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fillBank } from '../../../services/gapFill/fillBank.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';

const RAW_PROMPT = 'What does len("héllo") print in Python?';

describe('existing prompts sent to the model', () => {
    let outRoot: string;

    beforeEach(async () => {
        outRoot = await mkdtemp(join(tmpdir(), 'existing-raw-'));
        await mkdir(join(outRoot, 'classifications', 'python'), { recursive: true });
        await writeFile(join(outRoot, 'classifications', 'python', 'easy.json'), '{}');
    });

    afterEach(async () => {
        await rm(outRoot, { force: true, recursive: true });
    });

    it('lists the bank prompts as written, not normalized', async () => {
        const prompts: string[] = [];
        const provider = {
            async generate(request: { prompt: string }) {
                prompts.push(request.prompt);
                return { model: 'fake-model', value: { cards: [] } };
            },
        } as unknown as ModelProvider;
        const existing = {
            answer: true,
            id: 'existing-1',
            prompt: RAW_PROMPT,
            provenance: {
                isHumanReviewed: false,
                source: 'generated',
                validation: { method: 'executed', status: 'passed' },
            },
            query: { explanation: 'e', title: 't' },
            rationale: 'r',
            topic: 'strings',
            type: 'bool',
        } as unknown as Question;
        await fillBank({
            bankKey: 'python/easy',
            difficulty: 'easy',
            language: 'python',
            languageId: 'python',
            log: () => undefined,
            outRoot,
            provider,
            questions: [existing],
            run: async () => ({ outcome: 'value', runtimeVersion: '3.12.1', value: '3' }),
            topics: ['strings'],
        });
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts[0]).toContain(JSON.stringify(RAW_PROMPT).slice(1, -1));
    });
});
