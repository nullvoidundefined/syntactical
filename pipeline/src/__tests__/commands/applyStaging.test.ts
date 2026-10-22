// `pipeline apply-staging` over a copy of the real content: staged rationales and references land
// on the free bank's existing questions, only confirmed doc links ship, no question is added or
// dropped, and the manifest build runs afterwards. No model, no network.
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyStaging } from '../../commands/applyStaging.js';
import { writeJsonAtomic } from '../../services/json/writeJsonAtomic.js';

const REPO_CONTENT = new URL('../../../../content', import.meta.url).pathname;
const CONFIRMED = 'https://www.postgresql.org/docs/current/functions-string.html';
const UNCHECKED = 'https://www.postgresql.org/docs/current/made-up.html';

describe('applyStaging', () => {
    let workDir: string;
    let contentDir: string;
    let pipelineDir: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'apply-staging-'));
        contentDir = join(workDir, 'content');
        pipelineDir = join(workDir, 'pipeline');
        await cp(REPO_CONTENT, contentDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(workDir, { force: true, recursive: true });
    });

    async function readBank(): Promise<Question[]> {
        return (JSON.parse(await readFile(join(contentDir, 'postgres/easy.json'), 'utf8')) as { questions: Question[] })
            .questions;
    }

    it('fills rationales and references on existing questions and keeps every question', async () => {
        const before = await readBank();
        await writeJsonAtomic(join(pipelineDir, 'enrichment/postgres/easy.json'), {
            'pg-easy-01': [
                { choiceIndex: 0, misconceptionId: 'postgres.pipe-is-logical-or', rationale: 'MySQL habit.' },
            ],
        });
        await writeJsonAtomic(join(pipelineDir, 'references/postgres/easy.json'), {
            'pg-easy-02': {
                docs: [
                    { title: 'String functions', url: CONFIRMED },
                    { title: 'Unchecked', url: UNCHECKED },
                ],
                syntax: 'text1 || text2',
                title: 'String concatenation',
            },
        });
        await writeJsonAtomic(join(pipelineDir, 'references/doc-links.json'), {
            [CONFIRMED]: { checkedAt: 't', ok: true },
        });
        const buildManifest = vi.fn().mockResolvedValue(undefined);
        const tally = await applyStaging({ buildManifest, contentDir, log: () => undefined, pipelineDir });

        expect(tally).toEqual({ rationales: 1, references: 1 });
        expect(buildManifest).toHaveBeenCalledTimes(1);
        const after = await readBank();
        expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
        const first = after.find(({ id }) => id === 'pg-easy-01');
        expect(first?.type === 'mc' ? first.choices[0] : undefined).toMatchObject({
            misconceptionId: 'postgres.pipe-is-logical-or',
            rationale: 'MySQL habit.',
        });
        const second = after.find(({ id }) => id === 'pg-easy-02');
        expect(second?.query).toEqual({
            ...before.find(({ id }) => id === 'pg-easy-02')?.query,
            docs: [{ title: 'String functions', url: CONFIRMED }],
            syntax: 'text1 || text2',
            title: 'String concatenation',
        });
    });

    it('leaves a bank with nothing staged untouched', async () => {
        const before = await readFile(join(contentDir, 'postgres/easy.json'), 'utf8');
        await applyStaging({ buildManifest: async () => undefined, contentDir, log: () => undefined, pipelineDir });
        expect(await readFile(join(contentDir, 'postgres/easy.json'), 'utf8')).toBe(before);
    });
});
