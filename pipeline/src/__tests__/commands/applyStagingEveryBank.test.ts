// pipeline/src/__tests__/commands/applyStagingEveryBank.test.ts
// `pipeline apply-staging` over a copy of the real content covers Medium and Hard banks as it covers Easy: staged
// rationales and references land on their existing questions and no question is added or dropped. The test picks
// its question ids from the copied banks, so it holds as content changes. No model, no network.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyStaging } from '../../commands/applyStaging.js';
import { writeJsonAtomic } from '../../services/json/writeJsonAtomic.js';
import { copyOneTrack } from '../fixtures/copyOneTrack.js';

const REPO_CONTENT = new URL('../../../../content', import.meta.url).pathname;
const CONFIRMED = 'https://www.postgresql.org/docs/current/functions-string.html';
const TAG = 'postgres.pipe-is-logical-or';

describe('applyStaging on every bank', () => {
    let workDir: string;
    let contentDir: string;
    let pipelineDir: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'apply-staging-every-'));
        contentDir = join(workDir, 'content');
        pipelineDir = join(workDir, 'pipeline');
        await copyOneTrack(REPO_CONTENT, contentDir, 'postgres');
    });

    afterEach(async () => {
        await rm(workDir, { force: true, recursive: true });
    });

    async function readBank(bankPath: string): Promise<Question[]> {
        return (JSON.parse(await readFile(join(contentDir, bankPath), 'utf8')) as { questions: Question[] }).questions;
    }

    it('fills a rationale on a Medium question and a reference on a Hard question', async () => {
        const mediumBefore = await readBank('postgres/medium.json');
        const hardBefore = await readBank('postgres/hard.json');
        const target = mediumBefore.find((question) => question.type === 'mc');
        if (target?.type !== 'mc') throw new Error('postgres/medium.json has no multiple-choice question');
        const wrongIndex = target.answerIndex === 0 ? 1 : 0;
        const referenced = hardBefore[0] as Question;
        await writeJsonAtomic(join(pipelineDir, 'enrichment/postgres/medium.json'), {
            [target.id]: [{ choiceIndex: wrongIndex, misconceptionId: TAG, rationale: 'MySQL habit.' }],
        });
        await writeJsonAtomic(join(pipelineDir, 'references/postgres/hard.json'), {
            [referenced.id]: {
                docs: [{ title: 'String functions', url: CONFIRMED }],
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
        const mediumAfter = await readBank('postgres/medium.json');
        const hardAfter = await readBank('postgres/hard.json');
        expect(mediumAfter.map(({ id }) => id)).toEqual(mediumBefore.map(({ id }) => id));
        expect(hardAfter.map(({ id }) => id)).toEqual(hardBefore.map(({ id }) => id));
        const enriched = mediumAfter.find(({ id }) => id === target.id);
        expect(enriched?.type === 'mc' ? enriched.choices[wrongIndex] : undefined).toMatchObject({
            misconceptionId: TAG,
            rationale: 'MySQL habit.',
        });
        expect(hardAfter.find(({ id }) => id === referenced.id)?.query).toMatchObject({
            docs: [{ title: 'String functions', url: CONFIRMED }],
            syntax: 'text1 || text2',
            title: 'String concatenation',
        });
    });
});
