// publish keeps method 'judged' and the evidence of a generated judged card, publishes an
// owner-approved disputed card as judged and pending with isHumanReviewed true, and refuses an
// undecided or rejected disputed card. Real temp files; the manifest rebuild is stubbed.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { publish } from '../../commands/publish.js';

const HASH = '0123456789abcdef'.repeat(4);
const SOURCE = {
    quote: 'Lax cookies are not sent on cross-site POST requests',
    title: 'Using HTTP cookies',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
};
const EVIDENCE = { sources: [SOURCE], verdict: 'Supported.' };
const JUDGED_ID = 'gen-backend-security-easy-11111111';
const DISPUTED_ID = 'gen-backend-security-easy-dddddddd';

type Json = Record<string, unknown>;

function boolQuestion(id: string, validation: Json, prompt: string): Json {
    return {
        answer: true,
        id,
        prompt,
        provenance: { isHumanReviewed: false, source: 'generated', validation },
        query: { explanation: 'Lax sends cookies on top-level GET only.', title: 'SameSite=Lax' },
        rationale: 'Lax still sends the cookie on top-level GET.',
        topic: 'sessions',
        type: 'bool',
    };
}

const judgedCard = boolQuestion(
    JUDGED_ID,
    { evidence: EVIDENCE, method: 'judged', status: 'passed' },
    'SameSite=Lax withholds the cookie on cross-site POST.',
);

function disputedCard(): Json {
    return {
        blindAnswers: { claude: 0, codex: 1 },
        claimedIndex: 0,
        consistency: null,
        failure: 'blind-disagreement',
        question: boolQuestion(
            DISPUTED_ID,
            {
                evidence: { sources: [SOURCE], verdict: 'disputed: blind-disagreement' },
                method: 'judged',
                status: 'pending',
            },
            'SameSite=Strict withholds the cookie on top-level GET.',
        ),
    };
}

async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe('publish judged cards', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    let logs: string[];

    async function publishNow(): Promise<void> {
        await publish({
            buildManifest: async () => undefined,
            contentDir,
            contentRoot,
            log: (line) => logs.push(line),
            newRunId: () => 'run-publish',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
        });
    }

    async function publishedQuestions(): Promise<Json[]> {
        const bank = JSON.parse(await readFile(join(contentDir, 'backend-security/easy.json'), 'utf8')) as {
            questions: Json[];
        };
        return bank.questions;
    }

    async function stageDisputed(): Promise<void> {
        await writeJson(join(pipelineDir, 'disputed/backend-security/easy.json'), {
            cards: [disputedCard()],
            schemaVersion: 1,
        });
    }

    async function decide(decision: 'approve' | 'reject'): Promise<void> {
        await writeJson(join(pipelineDir, 'review/decisions/backend-security-easy.json'), {
            decisions: {
                [DISPUTED_ID]: { decision, fingerprint: 'f', provenance: { isHumanReviewed: decision === 'approve' } },
            },
            schemaVersion: 1,
        });
    }

    beforeEach(async () => {
        logs = [];
        root = await mkdtemp(join(tmpdir(), 'publish-judged-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeJson(join(contentDir, 'manifest.json'), {
            languages: [
                {
                    banks: {
                        easy: {
                            access: 'free',
                            contentVersion: 1,
                            hash: HASH,
                            path: 'backend-security/easy.json',
                            topicCounts: {},
                        },
                    },
                    glyph: 'BS',
                    grammar: 'plain',
                    id: 'backend-security',
                    kind: 'topic',
                    label: 'Backend security',
                    misconceptions: [],
                    tagline: 'T',
                    topics: [{ id: 'sessions', label: 'Sessions and cookies' }],
                },
            ],
            schemaVersion: 2,
        });
        await writeJson(join(pipelineDir, 'topics.json'), {});
        await writeJson(join(contentDir, 'backend-security/easy.json'), { questions: [], schemaVersion: 2 });
        await writeJson(join(pipelineDir, 'classifications/backend-security/easy.json'), {});
        await writeJson(join(pipelineDir, 'generated/backend-security/easy.json'), {
            questions: [judgedCard],
            schemaVersion: 2,
        });
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('publishes a generated judged card with method judged and its evidence', async () => {
        await publishNow();
        const published = (await publishedQuestions()).find(({ id }) => id === JUDGED_ID);
        expect(published).toMatchObject({
            provenance: {
                isHumanReviewed: false,
                validation: { evidence: EVIDENCE, method: 'judged', status: 'passed' },
            },
        });
    });

    it('refuses an undecided disputed card', async () => {
        await stageDisputed();
        await publishNow();
        expect((await publishedQuestions()).map(({ id }) => id)).toEqual([JUDGED_ID]);
        expect(logs).toContain(`backend-security/easy ${DISPUTED_ID}: refused (unvalidated-unreviewed)`);
    });

    it('publishes an approved disputed card as judged and pending, reviewed, with its evidence', async () => {
        await stageDisputed();
        await decide('approve');
        await publishNow();
        const published = (await publishedQuestions()).find(({ id }) => id === DISPUTED_ID);
        expect(published).toMatchObject({
            provenance: {
                isHumanReviewed: true,
                validation: {
                    evidence: { sources: [SOURCE], verdict: 'disputed: blind-disagreement' },
                    method: 'judged',
                    status: 'pending',
                },
            },
        });
    });

    it('drops a rejected disputed card', async () => {
        await stageDisputed();
        await decide('reject');
        await publishNow();
        expect((await publishedQuestions()).map(({ id }) => id)).toEqual([JUDGED_ID]);
        expect(logs).toContain(`backend-security/easy ${DISPUTED_ID}: refused (rejected)`);
    });
});
